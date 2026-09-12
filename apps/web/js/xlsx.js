const encoder = new TextEncoder();

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u16(value) {
  return new Uint8Array([value & 0xFF, (value >>> 8) & 0xFF]);
}

function u32(value) {
  return new Uint8Array([value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF, (value >>> 24) & 0xFF]);
}

function concat(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const stamp = dosDateTime();

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = file.data;
    const checksum = crc32(data);
    const localHeader = concat([
      u32(0x04034B50), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.date),
      u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0)
    ]);
    localParts.push(localHeader, name, data);

    const centralHeader = concat([
      u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.date),
      u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(localOffset)
    ]);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = concat(centralParts);
  const end = concat([
    u32(0x06054B50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralDirectory.length), u32(localOffset), u16(0)
  ]);
  return concat([...localParts, centralDirectory, end]);
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function cellXml(value, rowIndex, columnIndex) {
  const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }
  const text = /^[=+\-@]/.test(String(value ?? '')) ? `'${value}` : String(value ?? '');
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function sheetXml(headers, rows) {
  const allRows = [headers, ...rows];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${allRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => cellXml(value, rowIndex, columnIndex)).join('')}</row>`).join('')}</sheetData></worksheet>`;
}

export function createXlsxBytes(headers, rows, sheetName = '投放数据') {
  const files = [
    {
      name: '[Content_Types].xml',
      data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
    },
    {
      name: '_rels/.rels',
      data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
    },
    {
      name: 'xl/workbook.xml',
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`)
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
    },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml(headers, rows)) }
  ];
  return createZip(files);
}

export function createXlsxBlob(headers, rows, sheetName) {
  return new Blob([createXlsxBytes(headers, rows, sheetName)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}