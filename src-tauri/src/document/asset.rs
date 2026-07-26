use std::path::{Component, Path};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use percent_encoding::percent_decode_str;

use crate::errors::AppError;
use crate::types::LocalAssetDto;

const MAX_ASSET_BYTES: u64 = 20 * 1024 * 1024;

pub async fn load_local_asset(
    document_path: &Path,
    reference: &str,
) -> Result<LocalAssetDto, AppError> {
    let decoded = percent_decode_str(reference)
        .decode_utf8()
        .map_err(|_| AppError::ResourceDenied)?;
    let relative = Path::new(decoded.as_ref());
    validate_relative_path(relative)?;

    let document_root = document_path.parent().ok_or(AppError::ResourceDenied)?;
    let canonical_root = tokio::fs::canonicalize(document_root)
        .await
        .map_err(|_| AppError::ResourceDenied)?;
    let candidate = canonical_root.join(relative);
    let canonical_asset = tokio::fs::canonicalize(candidate)
        .await
        .map_err(|_| AppError::ResourceDenied)?;
    if !canonical_asset.starts_with(&canonical_root) {
        return Err(AppError::ResourceDenied);
    }

    let metadata = tokio::fs::metadata(&canonical_asset)
        .await
        .map_err(|_| AppError::ResourceDenied)?;
    if !metadata.is_file() || metadata.len() > MAX_ASSET_BYTES {
        return Err(AppError::ResourceDenied);
    }

    let bytes = tokio::fs::read(&canonical_asset)
        .await
        .map_err(|_| AppError::ResourceDenied)?;
    let mime_type = image_mime_type(&canonical_asset, &bytes).ok_or(AppError::ResourceDenied)?;
    Ok(LocalAssetDto {
        data_url: format!("data:{mime_type};base64,{}", STANDARD.encode(bytes)),
        mime_type: mime_type.to_owned(),
        byte_size: metadata.len(),
    })
}

fn validate_relative_path(path: &Path) -> Result<(), AppError> {
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
    {
        return Err(AppError::ResourceDenied);
    }
    Ok(())
}

fn image_mime_type(path: &Path, bytes: &[u8]) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Some("image/png"),
        "jpg" | "jpeg" if bytes.starts_with(&[0xff, 0xd8, 0xff]) => Some("image/jpeg"),
        "gif" if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") => Some("image/gif"),
        "webp"
            if bytes.starts_with(b"RIFF")
                && bytes.get(8..12).is_some_and(|value| value == b"WEBP") =>
        {
            Some("image/webp")
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{image_mime_type, load_local_asset, validate_relative_path};

    #[test]
    fn accepts_only_descendant_relative_paths() {
        assert!(validate_relative_path(Path::new("images/diagram.png")).is_ok());
        assert!(validate_relative_path(Path::new("./cover.webp")).is_ok());
        assert!(validate_relative_path(Path::new("../secret.png")).is_err());
        assert!(validate_relative_path(Path::new("C:\\secret.png")).is_err());
        assert!(validate_relative_path(Path::new("/etc/secret.png")).is_err());
    }

    #[test]
    fn verifies_image_signatures_instead_of_trusting_extensions() {
        assert_eq!(
            image_mime_type(Path::new("image.png"), b"\x89PNG\r\n\x1a\ncontent"),
            Some("image/png")
        );
        assert_eq!(image_mime_type(Path::new("image.png"), b"<script>"), None);
        assert_eq!(
            image_mime_type(Path::new("image.svg"), b"<svg></svg>"),
            None
        );
    }

    #[test]
    fn loads_percent_encoded_images_but_rejects_parent_traversal() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let root = std::env::temp_dir().join(format!("lithemark-assets-{unique}"));
        let document_directory = root.join("document");
        let image_directory = document_directory.join("images");
        assert!(std::fs::create_dir_all(&image_directory).is_ok());
        let document_path = document_directory.join("readme.md");
        assert!(std::fs::write(&document_path, "# Images").is_ok());
        assert!(
            std::fs::write(
                image_directory.join("small image.png"),
                b"\x89PNG\r\n\x1a\ncontent",
            )
            .is_ok()
        );
        assert!(std::fs::write(root.join("secret.png"), b"\x89PNG\r\n\x1a\nsecret").is_ok());

        let (allowed, denied) = tauri::async_runtime::block_on(async {
            (
                load_local_asset(&document_path, "images/small%20image.png").await,
                load_local_asset(&document_path, "../secret.png").await,
            )
        });
        let _ = std::fs::remove_dir_all(&root);

        assert!(allowed.is_ok());
        if let Ok(asset) = allowed {
            assert_eq!(asset.mime_type, "image/png");
            assert!(asset.data_url.starts_with("data:image/png;base64,"));
        }
        assert!(denied.is_err());
    }
}
