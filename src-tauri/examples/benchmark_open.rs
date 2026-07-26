use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use lithemark_lib::markdown::{parse_markdown_index, render_indexed_blocks};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkReport {
    generated_at_ms: u64,
    profile: &'static str,
    platform: String,
    cases: Vec<BenchmarkCase>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkCase {
    file: String,
    bytes: u64,
    read_ms: f64,
    initial_index_ms: f64,
    full_index_ms: f64,
    first_batch_render_ms: f64,
    block_count: usize,
    initial_block_count: usize,
    first_batch_html_bytes: usize,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let paths = std::env::args().skip(1).map(PathBuf::from);
    let mut cases = Vec::new();

    for path in paths {
        cases.push(benchmark(&path)?);
    }
    if cases.is_empty() {
        return Err("pass one or more generated Markdown fixture paths".into());
    }

    let report = BenchmarkReport {
        generated_at_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_millis()
            .try_into()
            .unwrap_or(u64::MAX),
        profile: "release",
        platform: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
        cases,
    };
    let json = serde_json::to_string_pretty(&report)?;
    println!("{json}");
    Ok(())
}

fn benchmark(path: &Path) -> Result<BenchmarkCase, Box<dyn std::error::Error>> {
    let started = Instant::now();
    let bytes = fs::read(path)?;
    let read_ms = milliseconds(started);
    let byte_count = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
    let source = std::str::from_utf8(&bytes)?;

    let started = Instant::now();
    let initial = parse_markdown_index(source, Some(120), None)?;
    let initial_index_ms = milliseconds(started);
    let initial_block_count = initial.blocks.len();

    let started = Instant::now();
    let full = parse_markdown_index(source, None, None)?;
    let full_index_ms = milliseconds(started);

    let started = Instant::now();
    let batch = render_indexed_blocks(source, &full.blocks[..full.blocks.len().min(48)]);
    let first_batch_render_ms = milliseconds(started);
    let first_batch_html_bytes = batch
        .iter()
        .filter_map(|block| block.html.as_ref())
        .map(String::len)
        .sum();

    Ok(BenchmarkCase {
        file: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("unknown")
            .to_owned(),
        bytes: byte_count,
        read_ms,
        initial_index_ms,
        full_index_ms,
        first_batch_render_ms,
        block_count: full.blocks.len(),
        initial_block_count,
        first_batch_html_bytes,
    })
}

fn milliseconds(started: Instant) -> f64 {
    started.elapsed().as_secs_f64() * 1_000.0
}
