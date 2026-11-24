// tiny-stack-vm: a stack VM for make.fun's tiny stack ISA v1 (MIT). Runs every program.bin on its input.bin
// and writes the exact output bytes and exit code (halt, EXIT, or a trap's code). Node 22, stdlib only.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Run one program to its end; returns the bytes it wrote and the code it ended with. */
function run(prog: Buffer, input: Buffer): [Buffer, number] {
  const st = new Int32Array(256);
  const calls = new Int32Array(64);
  const mem = new Int32Array(256);
  const out: number[] = [];
  const n = prog.length;
  let sp = 0, csp = 0, pc = 0, steps = 0, inp = 0, exit = -1;
  const gate = (pops: number, pushes: number): number => (sp < pops ? 2 : sp - pops + pushes > 256 ? 3 : 0);
  main: while (exit < 0) {
    if (steps >= 1_000_000) { exit = 10; break; }
    if (pc < 0 || pc >= n) { exit = 9; break; }
    const op = prog[pc]!;
    const imm = op === 0x01 ? 1 : op === 0x02 ? 4 : op >= 0x30 && op <= 0x33 ? 2 : 0;
    const known = op <= 0x07 || (op >= 0x10 && op <= 0x1e) || (op >= 0x20 && op <= 0x22) ||
      (op >= 0x30 && op <= 0x34) || op === 0x40 || op === 0x41 || (op >= 0x50 && op <= 0x53);
    if (!known) { exit = 5; break; }
    if (pc + 1 + imm > n) { exit = 9; break; }
    steps++;
    let trap = 0;
    switch (op) {
      case 0x00: exit = 0; break;
      case 0x01: trap = gate(0, 1); if (!trap) { const b = prog[pc + 1]!; st[sp++] = b < 128 ? b : b - 256; } pc += 2; break;
      case 0x02: trap = gate(0, 1); if (!trap) st[sp++] = prog.readInt32LE(pc + 1); pc += 5; break;
      case 0x03: trap = gate(1, 0); if (!trap) sp--; pc++; break;
      case 0x04: trap = gate(1, 2); if (!trap) { st[sp] = st[sp - 1]!; sp++; } pc++; break;
      case 0x05: trap = gate(2, 2); if (!trap) { const t = st[sp - 1]!; st[sp - 1] = st[sp - 2]!; st[sp - 2] = t; } pc++; break;
      case 0x06: trap = gate(2, 3); if (!trap) { st[sp] = st[sp - 2]!; sp++; } pc++; break;
      case 0x07: trap = gate(3, 3); if (!trap) { const a = st[sp - 3]!, b = st[sp - 2]!, c = st[sp - 1]!; st[sp - 3] = b; st[sp - 2] = c; st[sp - 1] = a; } pc++; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        trap = gate(2, 1);
        if (!trap) {
          const b = st[--sp]!, a = st[--sp]!;
          let r = 0;
          switch (op) {
            case 0x10: r = (a + b) | 0; break;
            case 0x11: r = (a - b) | 0; break;
            case 0x12: r = Math.imul(a, b); break;
            case 0x13: if (b === 0) trap = 4; else r = (a / b) | 0; break;
            case 0x14: if (b === 0) trap = 4; else r = (a % b) | 0; break;
            case 0x15: if (b === 0) trap = 4; else r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
            case 0x16: if (b === 0) trap = 4; else r = ((a >>> 0) % (b >>> 0)) | 0; break;
            case 0x18: r = a & b; break;
            case 0x19: r = a | b; break;
            case 0x1a: r = a ^ b; break;
            case 0x1c: r = a << (b & 31); break;
            case 0x1d: r = a >> (b & 31); break;
            case 0x1e: r = (a >>> (b & 31)) | 0; break;
            case 0x20: r = a === b ? 1 : 0; break;
            case 0x21: r = a < b ? 1 : 0; break;
            default: r = (a >>> 0) < (b >>> 0) ? 1 : 0; break;
          }
          if (!trap) st[sp++] = r;
        }
        pc++;
        break;
      }
      case 0x17: trap = gate(1, 1); if (!trap) st[sp - 1] = (-st[sp - 1]!) | 0; pc++; break;
      case 0x1b: trap = gate(1, 1); if (!trap) st[sp - 1] = ~st[sp - 1]!; pc++; break;
      case 0x30: pc = pc + 3 + prog.readInt16LE(pc + 1); break;
      case 0x31: trap = gate(1, 0); if (!trap) pc = st[--sp]! === 0 ? pc + 3 + prog.readInt16LE(pc + 1) : pc + 3; break;
      case 0x32: trap = gate(1, 0); if (!trap) pc = st[--sp]! !== 0 ? pc + 3 + prog.readInt16LE(pc + 1) : pc + 3; break;
      case 0x33: if (csp >= 64) trap = 7; else { calls[csp++] = pc + 3; pc = prog.readUInt16LE(pc + 1); } break;
      case 0x34: if (csp === 0) trap = 8; else pc = calls[--csp]!; break;
      case 0x40: trap = gate(1, 1); if (!trap) { const addr = st[sp - 1]!; if (addr < 0 || addr > 255) trap = 6; else st[sp - 1] = mem[addr]!; } pc++; break;
      case 0x41: trap = gate(2, 0); if (!trap) { const addr = st[sp - 1]!, v = st[sp - 2]!; if (addr < 0 || addr > 255) trap = 6; else { sp -= 2; mem[addr] = v; } } pc++; break;
      case 0x50: trap = gate(1, 0); if (!trap) { const s = String(st[sp - 1]!); if (out.length + s.length > 65_536) trap = 11; else { sp--; for (let k = 0; k < s.length; k++) out.push(s.charCodeAt(k)); } } pc++; break;
      case 0x51: trap = gate(1, 0); if (!trap) { if (out.length + 1 > 65_536) trap = 11; else out.push(st[--sp]! & 255); } pc++; break;
      case 0x52: trap = gate(0, 1); if (!trap) st[sp++] = inp < input.length ? input[inp++]! : -1; pc++; break;
      case 0x53: trap = gate(1, 0); if (!trap) exit = st[--sp]! & 255; pc++; break;
    }
    if (trap) { exit = trap; break main; }
  }
  return [Buffer.from(out), exit];
}

for (const id of readdirSync(IN_DIR).sort()) {
  const prog = readFileSync(join(IN_DIR, id, 'program.bin'));
  const inputPath = join(IN_DIR, id, 'input.bin');
  const input = existsSync(inputPath) ? readFileSync(inputPath) : Buffer.alloc(0);
  const [out, code] = run(prog, input);
  mkdirSync(join(OUT_DIR, id), { recursive: true });
  writeFileSync(join(OUT_DIR, id, 'stdout.bin'), out);
  writeFileSync(join(OUT_DIR, id, 'exit.txt'), `${code}\n`);
}
