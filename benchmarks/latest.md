# Large-document open benchmark

Release build on `windows-x86_64`. Fixtures are deterministic and can be regenerated with
`pnpm fixtures:large -- --sizes=1,10,50`.

| Fixture |     Read | Initial index | Full background index | First 48 blocks |  Blocks |
| ------- | -------: | ------------: | --------------------: | --------------: | ------: |
| 1 MiB   |  1.13 ms |       8.32 ms |              43.44 ms |         2.71 ms |  16,982 |
| 10 MiB  |  7.00 ms |       7.59 ms |             394.66 ms |         1.46 ms | 169,748 |
| 50 MiB  | 33.81 ms |      10.59 ms |           1,834.81 ms |         1.46 ms | 848,709 |

The synchronous path reads the UTF-8 source and indexes at most a 512 KiB prefix. Full indexing
runs in a cancellable blocking worker. HTML generation is deferred to requested block batches;
the recorded first batch contains 5,282 bytes of HTML for every fixture.
