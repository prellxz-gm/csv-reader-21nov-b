// Line-Fast: a fast drop-in for csv-reader 1.0.0.
//
// Same answers as csv-reader on every input {text, header}: {columns, rows, errors}.
// Speed comes from a record-level fast path: most records are plain lines with no
// quotes and no stray carriage returns, so they are split with native indexOf/split
// instead of a per-character loop. Any record that contains a quote or a stray CR
// falls back to a careful scanner that reproduces csv-reader's broken-row policy
// exactly. Fields are always slices of the input, never built up a character at a
// time, and no regular expressions or closures sit in the hot paths.
//
// Policy (csv-reader 1.0.0):
// - U+FEFF at the very start is dropped.
// - A record ends at LF or CRLF; a line with no characters is no record.
// - Outside quotes a CR not followed by LF is dropped and records stray_cr.
// - A field opening with a quote runs to the next non-doubled quote; "" inside is
//   one quote; CRLF or a lone CR inside reads as LF; junk after the closing quote
//   up to the next comma or line break is appended as-is (quote_junk when the
//   field ends); a quote that never closes is a literal character and the text
//   after it is re-read as unquoted (unterminated_quote).
// - A quote inside an unquoted field is a literal character. Fields stay strings.
// - columns is the first record when header is true, else null; rows are the rest,
//   padded with "" (short_row, fields: count before padding) or cut (long_row,
//   extra: the cut fields) to the first record's width.
// - Every error is {code, line, row}, in the order met; line is the 1-based line
//   the record starts on (every LF, CRLF and lone CR inside quotes counted),
//   row is the record's index in rows, null for the header. A record's short_row
//   or long_row fires when the record ends; a field's quote_junk when it ends.

const COMMA = 0;
const BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // Line and row of the record currently being read; every error raised while
  // reading it is stamped with these.
  let recordLine = 1;
  let recordRow = null;

  // Reads an unquoted field starting at pos, appending onto `prefix`.
  // Returns {value, ended, added}; ended is COMMA, BREAK or END, and `added`
  // counts the characters kept here. A CR not followed by LF is dropped and
  // records stray_cr. When no stray CR splits the field, the value is a
  // single slice of the input (no concatenation at all).
  function scanPlain(prefix, added0) {
    let added = added0;
    let parts = null;
    let segStart = pos;
    let end;
    let ended;
    for (;;) {
      while (pos < n) {
        const c = text.charCodeAt(pos);
        if (c === 44 || c === 10 || c === 13) break;
        pos++;
      }
      if (pos >= n) {
        end = n;
        ended = END;
        break;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        end = pos;
        pos += 1;
        ended = COMMA;
        break;
      }
      if (c === 10) {
        end = pos;
        pos += 1;
        line += 1;
        ended = BREAK;
        break;
      }
      if (text.charCodeAt(pos + 1) === 10) {
        end = pos;
        pos += 2;
        line += 1;
        ended = BREAK;
        break;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (parts === null) parts = [prefix];
      parts.push(text.slice(segStart, pos));
      added += pos - segStart;
      pos += 1;
      segStart = pos;
    }
    added += end - segStart;
    let value;
    if (parts === null) {
      value = prefix === '' ? text.slice(segStart, end) : prefix + text.slice(segStart, end);
    } else {
      parts.push(text.slice(segStart, end));
      value = parts.join('');
    }
    return { value, ended, added };
  }

  // Content of text[a..b) inside a quoted field: a CR and a CRLF each become
  // one LF, and `line` advances once per line break inside. The common case
  // (no line break at all) is a plain slice.
  function quotedSeg(a, b) {
    const seg = text.slice(a, b);
    if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) return seg;
    let out = '';
    let s = 0;
    for (let i = 0; i < seg.length; i++) {
      const c = seg.charCodeAt(i);
      if (c === 13) {
        out += seg.slice(s, i);
        out += '\n';
        line += 1;
        if (seg.charCodeAt(i + 1) === 10) i += 1;
        s = i + 1;
      } else if (c === 10) {
        out += seg.slice(s, i);
        out += '\n';
        line += 1;
        s = i + 1;
      }
    }
    if (s < seg.length) out += seg.slice(s);
    return out;
  }

  // Reads a quoted field whose opening quote is at pos. Returns the same shape
  // as scanPlain; `added` is only non-zero for junk after the closing quote.
  // The closing quote is found with indexOf: doubled quotes are folded in as
  // one literal quote and the scan continues after the pair.
  function scanQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let cur = pos + 1;
    let closed = false;
    for (;;) {
      const q = text.indexOf('"', cur);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        value += quotedSeg(cur, q) + '"';
        cur = q + 2;
        continue;
      }
      value += quotedSeg(cur, q);
      pos = q + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as unquoted, from where the scan started.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return scanPlain('"', 0);
    }
    if (pos >= n) return { value, ended: END, added: 0 };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA, added: 0 };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: BREAK, added: 0 };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: BREAK, added: 0 };
    }
    const junk = scanPlain(value, 0);
    if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  // Reads one whole record starting at pos, field by field, for records the
  // fast path cannot take. Returns the field list, or null when the line held
  // only stray CRs and so is no record (its stray_cr errors stay).
  function parseCareful() {
    const fields = [];
    let lastQuoted = false;
    let ended;
    do {
      lastQuoted = text.charCodeAt(pos) === 34;
      const f = lastQuoted ? scanQuoted() : scanPlain('', 0);
      fields.push(f.value);
      ended = f.ended;
    } while (ended === COMMA);
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) return null;
    return fields;
  }

  while (pos < n) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const nl = text.indexOf('\n', pos);
    let fields;
    if (nl === -1) {
      // Last record: no line break after it.
      const tail = text.slice(pos);
      if (tail.indexOf('"') === -1 && tail.indexOf('\r') === -1) {
        fields = tail.split(',');
        pos = n;
      } else {
        fields = parseCareful();
      }
    } else {
      // Content of this record's first line, without a CRLF terminator.
      let end = nl;
      if (end > pos && text.charCodeAt(end - 1) === 13) end -= 1;
      const chunk = text.slice(pos, end);
      if (chunk.indexOf('"') === -1 && chunk.indexOf('\r') === -1) {
        if (end === pos) {
          pos = nl + 1;
          line += 1;
          continue;
        }
        fields = chunk.split(',');
        pos = nl + 1;
        line += 1;
      } else {
        fields = parseCareful();
      }
    }
    if (fields === null) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
