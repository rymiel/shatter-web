class ByteBuf {
  memory: Uint8Array;
  index: number;

  constructor(memory: Uint8Array) {
    this.memory = memory;
    this.index = 0;
  }

  readUint8() {
    return this.memory[this.index++];
  }

  readUint32() {
    const a = this.memory[this.index++];
    const b = this.memory[this.index++];
    const c = this.memory[this.index++];
    const d = this.memory[this.index++];
    return (a << 24) | (b << 16) | (c << 8) | d;
  }

  readVarint() {
    let value = 0;
    let length = 0;

    for (;;) {
      const currentByte = this.readUint8();
      value |= (currentByte & 0x7f) << (length * 7);

      if (++length > 5) throw "Varint is too big";
      if ((currentByte & 0x80) != 0x80) break;
    }
    return value;
  }
}

const test = new ByteBuf(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x08]));
console.log(test);
console.log(test.readVarint());
console.log(test);
