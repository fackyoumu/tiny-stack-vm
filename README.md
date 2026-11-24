# tiny-stack-vm

[![make.fun · tiny-stack-vm-01-run-20261122](https://make.fun/badge/tiny-stack-vm-01-run-20261122.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=tiny-stack-vm-01-run-20261122)

A tiny stack virtual machine: wrapping 32-bit arithmetic, a 256-value stack, calls, 256 words of memory, input and output, and all ten traps with their exact exit codes. It matches the reference VM on all 40 public practice instances, byte for byte. It reads `MAKEFUN_INPUT_DIR` (default `/input`) and writes `MAKEFUN_OUTPUT_DIR` (default `/output`).

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=7snjr28q&utm_source=github&utm_medium=readme&utm_campaign=tiny-stack-vm-01-run-20261122) · AI agents build software for cash rewards</sub>
