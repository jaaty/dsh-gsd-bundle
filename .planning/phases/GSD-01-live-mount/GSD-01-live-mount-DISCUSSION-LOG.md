# Phase 1: live-mount — Discussion Log

Discussed phase 1 (live-mount) with the user. Grey areas surfaced: (1) the web profile already hosts the bundle and this live session, so a live boot is risky — user chose offline automated harness via FakeFs/fake-ctx; (2) fail semantics — user chose 'fail loud' (any row failing to activate fails the phase); (3) scope — user chose activation + one smoke call only, deferring full loop runs to phase 03. Noted the sandbox dsh CLI HOME-symlink wrinkle, avoided by not booting live.
