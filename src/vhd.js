import assert from 'assert'
import fu from '@nraynaud/struct-fu'
import { dirname, resolve } from 'path'

// ===================================================================
//
// Spec:
// https://www.microsoft.com/en-us/download/details.aspx?id=23850
//
// C implementation:
// https://github.com/rubiojr/vhd-util-convert
//
// ===================================================================

/* eslint-disable no-unused-vars */

const HARD_DISK_TYPE_DIFFERENCING = 4
const HARD_DISK_TYPE_DYNAMIC = 3
const HARD_DISK_TYPE_FIXED = 2
const PLATFORM_CODE_NONE = 0
export const SECTOR_SIZE = 512

/* eslint-enable no-unused vars */

// ===================================================================

const fuFooter = fu.struct([
  fu.char('cookie', 8), // 0
  fu.uint32('features'), // 8
  fu.uint32('fileFormatVersion'), // 12
  fu.struct('dataOffset', [
    fu.uint32('high'), // 16
    fu.uint32('low') // 20
  ]),
  fu.uint32('timestamp'), // 24
  fu.char('creatorApplication', 4), // 28
  fu.uint32('creatorVersion'), // 32
  fu.uint32('creatorHostOs'), // 36
  fu.struct('originalSize', [ // At the creation, current size of the hard disk.
    fu.uint32('high'), // 40
    fu.uint32('low') // 44
  ]),
  fu.struct('currentSize', [ // Current size of the virtual disk. At the creation: currentSize = originalSize.
    fu.uint32('high'), // 48
    fu.uint32('low') // 52
  ]),
  fu.struct('diskGeometry', [
    fu.uint16('cylinders'), // 56
    fu.uint8('heads'), // 58
    fu.uint8('sectorsPerTrackCylinder') // 59
  ]),
  fu.uint32('diskType'), // 60 Disk type, must be equal to HARD_DISK_TYPE_DYNAMIC/HARD_DISK_TYPE_DIFFERENCING.
  fu.uint32('checksum'), // 64
  fu.uint8('uuid', 16), // 68
  fu.char('saved'), // 84
  fu.char('hidden'), // 85
  fu.byte('reserved', 426) // 86
])
const FOOTER_SIZE = fuFooter.size

const fuHeader = fu.struct([
  fu.char('cookie', 8),
  fu.struct('dataOffset', [
    fu.uint32('high'),
    fu.uint32('low')
  ]),
  fu.struct('tableOffset', [ // Absolute byte offset of the Block Allocation Table.
    fu.uint32('high'),
    fu.uint32('low')
  ]),
  fu.uint32('headerVersion'),
  fu.uint32('maxTableEntries'), // Max entries in the Block Allocation Table.
  fu.uint32('blockSize'), // Block size in bytes. Default (2097152 => 2MB)
  fu.uint32('checksum'),
  fu.uint8('parentUuid', 16),
  fu.uint32('parentTimestamp'),
  fu.byte('reserved1', 4),
  fu.char16be('parentUnicodeName', 512),
  fu.struct('parentLocatorEntry', [
    fu.uint32('platformCode'),
    fu.uint32('platformDataSpace'),
    fu.uint32('platformDataLength'),
    fu.uint32('reserved'),
    fu.struct('platformDataOffset', [ // Absolute byte offset of the locator data.
      fu.uint32('high'),
      fu.uint32('low')
    ])
  ], 8),
  fu.byte('reserved2', 256)
])
const HEADER_SIZE = fuHeader.size

// ===================================================================
// Helpers
// ===================================================================

const SIZE_OF_32_BITS = Math.pow(2, 32)
const uint32ToUint64 = fu => fu.high * SIZE_OF_32_BITS + fu.low

// Returns a 32 bits integer corresponding to a Vhd version.
const getVhdVersion = (major, minor) => (major << 16) | (minor & 0x0000FFFF)

// bytes[] bit manipulation
const createBitmap = bits => Buffer.alloc(Math.ceil(bits / 3))
const testBit = (map, bit) => map[bit >> 3] & 1 << (bit & 7)
const setBit = (map, bit) => {
  map[bit >> 3] |= 1 << (bit & 7)
}
const unsetBit = (map, bit) => {
  map[bit >> 3] &= ~(1 << (bit & 7))
}

const addOffsets = (...offsets) => offsets.reduce(
  (a, b) => b == null
    ? a
    : typeof b === 'object'
      ? { bytes: a.bytes + b.bytes, bits: a.bits + b.bits }
      : { bytes: a.bytes + b, bits: a.bits },
  { bytes: 0, bits: 0 }
)

const pack = (field, value, buf, offset) => {
  field.pack(
    value,
    buf,
    addOffsets(field.offset, offset)
  )
}

const unpack = (field, buf, offset) =>
  field.unpack(
    buf,
    addOffsets(field.offset, offset)
  )

// ===================================================================

const streamToNewBuffer = stream => new Promise((resolve, reject) => {
  const chunks = []
  let length = 0

  const onData = chunk => {
    chunks.push(chunk)
    length += chunk.length
  }
  stream.on('data', onData)

  const clean = () => {
    stream.removeListener('data', onData)
    stream.removeListener('end', onEnd)
    stream.removeListener('error', onError)
  }
  const onEnd = () => {
    resolve(Buffer.concat(chunks, length))
    clean()
  }
  stream.on('end', onEnd)
  const onError = error => {
    reject(error)
    clean()
  }
  stream.on('error', onError)
})

const streamToExistingBuffer = (
  stream,
  buffer,
  offset = 0,
  end = buffer.length
) => new Promise((resolve, reject) => {
  assert(offset >= 0)
  assert(end > offset)
  assert(end <= buffer.length)

  let i = offset

  const onData = chunk => {
    if (i >= end) {
      return onError(new Error('too much data'))
    }

    const n = Math.min(end - i, chunk.length)
    i += chunk.copy(buffer, i, 0, n)
  }
  stream.on('data', onData)

  const clean = () => {
    stream.removeListener('data', onData)
    stream.removeListener('end', onEnd)
    stream.removeListener('error', onError)
  }
  const onEnd = () => {
    resolve(i - offset)
    clean()
  }
  stream.on('end', onEnd)
  const onError = error => {
    reject(error)
    clean()
  }
  stream.on('error', onError)
})

// ===================================================================

// Returns the checksum of a raw struct.
const computeChecksum = (struct, buf, offset = 0) => {
  let sum = 0

  // Do not use the stored checksum to compute the new checksum.
  const checksumField = struct.fields.checksum
  const checksumOffset = offset + checksumField.offset
  for (let i = offset, n = checksumOffset; i < n; ++i) {
    sum += buf[i]
  }
  for (let i = checksumOffset + checksumField.size, n = offset + struct.size; i < n; ++i) {
    sum += buf[i]
  }

  return ~sum >>> 0
}

const updateChecksum = (struct, buf, offset) => {
  pack(struct.fields.checksum, computeChecksum(struct, buf, offset), buf, offset)
}

const verifyChecksum = (struct, buf, offset) =>
  unpack(struct.fields.checksum, buf, offset) === computeChecksum(struct, buf, offset)

const getParentLocatorSize = parentLocatorEntry => {
  const { platformDataSpace } = parentLocatorEntry

  if (platformDataSpace < SECTOR_SIZE) {
    return platformDataSpace * SECTOR_SIZE
  }

  return (platformDataSpace % SECTOR_SIZE === 0)
    ? platformDataSpace
    : 0
}

// ===================================================================

// Euclidean division, returns the quotient and the remainder of a / b.
const div = (a, b) => [ Math.floor(a / b), a % b ]

const wrap = value => () => value

export default class Vhd {
  constructor (handler, path) {
    this._handler = handler
    this._path = path

    this._blockAllocationTable = null
    this._blockBitmapSize = null
    this._footer = null
    this._header = null
    this._parent = null
    this._sectorsPerBlock = null
  }

  get size () {
    return uint32ToUint64(this._footer.currentSize)
  }

  // Read `length` bytes starting from `begin`.
  //
  // - if `buffer`: it is filled starting from `offset`, and the
  //   number of written bytes is returned;
  // - otherwise: a new buffer is allocated and returned.
  _read (begin, length, buf, offset) {
    assert(begin >= 0)
    assert(length > 0)

    return this._handler.createReadStream(this._path, {
      end: begin + length - 1,
      start: begin
    }).then(buf
      ? stream => streamToExistingBuffer(stream, buf, offset, (offset || 0) + length)
      : streamToNewBuffer
    )
  }

  // - if `buffer`: it is filled with 0 starting from `offset`, and
  //   the number of written bytes is returned;
  // - otherwise: a new buffer is allocated and returned.
  _zeroes (length, buf, offset = 0) {
    if (buf) {
      assert(offset >= 0)
      assert(length > 0)

      const end = offset + length
      assert(end <= buf.length)

      buf.fill(0, offset, end)
      return Promise.resolve(length)
    }

    return Promise.resolve(Buffer.alloc(length))
  }

  // Return the position of a block in the VHD or undefined if not found.
  _getBlockAddress (block) {
    if (block < this._header.maxTableEntries) {
      const blockAddr = this._blockAllocationTable[block]
      if (blockAddr !== 0xFFFFFFFF) {
        return blockAddr * SECTOR_SIZE
      }
    }
  }

  _write (begin, buf) {
    return this._handler.createOutputStream(this._path, {
      start: begin
    }).then(stream => new Promise((resolve, reject) => {
      stream.once('error', reject)
      stream.end(buf, resolve)
    }))
  }

  // -----------------------------------------------------------------

  async readHeaderAndFooter () {
    const buf = await this._read(0, FOOTER_SIZE + HEADER_SIZE)

    if (!verifyChecksum(fuFooter, buf)) {
      throw new Error('footer checksum does not match')
    }

    if (!verifyChecksum(fuHeader, buf, FOOTER_SIZE)) {
      throw new Error('header checksum does not match')
    }

    return this._initMetadata(
      unpack(fuHeader, buf, FOOTER_SIZE),
      unpack(fuFooter, buf)
    )
  }

  async writeHeaderAndFooter (header, footer) {
    const buf = Buffer.allocUnsafe(FOOTER_SIZE + HEADER_SIZE)

    pack(footer, buf)
    pack(header, buf, FOOTER_SIZE)

    updateChecksum(fuFooter, buf)
    updateChecksum(fuHeader, buf, FOOTER_SIZE)

    await Promise.all([
      this._write(0, buf),
      this._write()
    ])

    return this._initMetadata(header, footer)
  }

  async _initMetadata (header, footer) {
    const sectorsPerBlock = Math.floor(header.blockSize / SECTOR_SIZE)

    this._blockBitmapSize = Math.ceil(sectorsPerBlock / 8) // 1 bit per sector
    this._footer = footer
    this._header = header
    this._sectorsPerBlock = sectorsPerBlock
    this._structBlockAllocationTable = uint32ToUint64(header.maxTableEntries)

    if (footer.diskType === HARD_DISK_TYPE_DIFFERENCING) {
      const parent = new Vhd(
        this._handler,
        resolve(dirname(this._path), header.parentUnicodeName)
      )
      await parent.readHeaderAndFooter()
      await parent.readBlockAllocationTable()

      this._parent = parent
    }
  }

  // -----------------------------------------------------------------

  async readBlockAllocationTable () {
    const { maxTableEntries, tableOffset } = this._header
    const structBlockAllocationTable = this._structBlockAllocationTable

    this._blockAllocationTable = unpack(
      structBlockAllocationTable,
      await this._read(uint32ToUint64(tableOffset), structBlockAllocationTable.size)
    )
  }

  writeBlockAllocationTable (table) {
    const { maxTableEntries, tableOffset } = this._header
    const structBlockAllocationTable = this._structBlockAllocationTable

    return this._write(
      uint32ToUint64(tableOffset),
      structBlockAllocationTable.pack(table)
    ).then(() => {
      this._blockAllocationTable = table
    })
  }

  // -----------------------------------------------------------------

  // allocate a new block in the given table
  async _allocateBlock (table, blockId) {
    const { maxTableEntries, tableOffset } = this._header

    // find the highest first sector of used blocks
    let maxSector = 0
    for (let i = 0; i < maxTableEntries; ++i) {
      const blockSector = table[i]
      if (blockSector !== 0xFFFFFFFF && blockSector > maxSector) {
        maxSector = blockSector
      }
    }

    table[blockId] = maxSector
      ? maxSector + this._sectorsPerBlock
      : Math.ceil(
        (uint32ToUint64(tableOffset) + this._structBlockAllocationTable.size) / SECTOR_SIZE
      )
  }

  // async _readBlockSectors (block, sectorsToRead, beginByte, endByte, buf, offset) {
  //   const blockAddr = this._getBlockAddress(block)
  //   if (!blockAddr) {
  //     for
  //   }

  //   const blockBitmapSize = this._blockBitmapSize
  //   const bitmap = await this._read(blockAddr, blockBitmapSize)
  // }

  _readBlock (block, begin, length, buf, offset) {
    assert(begin >= 0)
    assert(length > 0)
    assert(begin + length <= this._header.blockSize)

    const parent = this._parent

    const blockAddr = this._getBlockAddress(block)
    if (!blockAddr) {
      return parent
        ? parent._readBlock(block, begin, length, buf, offset)
        : this._zeroes(length, buf, offset)
    }

    const { blockSize } = this._header

    const blockBitmapSize = this._blockBitmapSize

    if (!parent) { // non differencing
      return this._read(blockAddr + blockBitmapSize + begin, length, buf, offset)
    }

    throw new Error('not implemented')

    // const [ beginSector, beginByte ] = div(begin, SECTOR_SIZE)
    // const [ endSector, endByte ] = div(begin + length - 1, SECTOR_SIZE)

    // const multiranges = []
    // for (let sector = beginSector; sector <= endSector; ++sector) {

    //   const
    //   while ()
    // }

    // return this._readBlockSectors(block, sectorsToRead, beginByte, endByte, buf, offset)
  }

  // Read a sector.
  async readSector (sector, buf, offset) {
    const [ block, sectorInBlock ] = div(sector, this._sectorsPerBlock)

    const blockAddr = this._getBlockAddress(block)
    const parent = this._parent
    if (blockAddr) {
      const blockBitmapSize = this._blockBitmapSize

      const bitmap = await this._read(blockAddr, blockBitmapSize)
      if (testBit(bitmap, sectorInBlock)) {
        return this._read(
          blockAddr + blockBitmapSize + sectorInBlock * SECTOR_SIZE,
          SECTOR_SIZE,
          buf,
          offset
        )
      }
    } else if (!parent) {
      return this._zeroes(SECTOR_SIZE, buf, offset)
    }

    return parent.readSector(sector, buf, offset)
  }

  read (buffer, begin, length = buffer.length) {
    assert(Buffer.isBuffer(buffer))
    assert(begin >= 0)
    assert(length <= buffer.length)

    const { size } = this
    if (begin >= size) {
      return Promise.resolve(0)
    }

    const end = Math.min(size, begin + length)

    const { blockSize } = this._header
    const [ beginBlock, beginOffsetInBlock ] = div(begin, blockSize)
    const [ endBlock, endOffsetInBlock ] = div(end - 1, blockSize)

    const promises = []
    for (let block = beginBlock; block <= endBlock; ++block) {
      const beginInBlock = block === beginBlock ? beginOffsetInBlock : 0
      const endInBlock = block === endBlock ? endOffsetInBlock + 1 : blockSize
      promises.push(this._readBlock(
        block,
        beginInBlock,
        endInBlock - beginInBlock,
        buffer,
        block === beginBlock
          ? 0
          : (block - beginBlock) * blockSize - beginOffsetInBlock
      ))
    }
    return Promise.all(promises).then(() => end - begin)
  }
}
