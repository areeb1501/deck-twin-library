# Reading documents

How to read each kind of document for [Workflow B](../SKILL.md). Read them all before you write anything, then merge. Put every document and revision in the plant's `"source"`, and keep a list of what each one contributed.

| Document | Use it for |
|---|---|
| P&ID, PFD | What connects to what, tags, line valves, instruments |
| Line list | Line numbers, sizes, service, class, insulation, from and to |
| Equipment list, datasheets, vendor drawings | Sizes, design pressure and temperature, power, nozzle sizes |
| Plot plan, GA, elevations, isometrics | Positions, levels, rotation, rack routes |
| Process description, design basis, cause & effect, emails, notes | Intent, duty and standby, what is out of scope, gaps the drawings leave |

## When documents disagree

1. The newest revision wins.
2. Otherwise the most specific document wins: a datasheet over an equipment list, a line list over a line number on a drawing, a plot plan over the layout rules.
3. Never choose silently. Record the conflict, what you chose and why.

## Drawings

1. **Check legibility.** Small text is usually unreadable at sheet scale. Read the whole sheet first for the layout, title block and legend, then tile it:
   ```bash
   python3 -I scripts/tile.py sheet.png --grid 3x2 --scale 2
   ```
   For one area, use `--crop x0,y0,x1,y1` with fractions of the sheet.
2. **Rasterise PDFs** page by page, for example `pdftoppm -r 200 -png file.pdf sheet` (`-r 300` for dense sheets). If the PDF has a text layer, `pdftotext -layout` gives the tags exactly, so use it to check what you read.
3. **Read the sheet's own legend first.** Company legends vary, so the drawing's legend wins. Then match symbols with [pid-legend.md](pid-legend.md) and [pid-symbols.md](pid-symbols.md).
4. **The tag decides.** Use the letters to confirm a match (V, P, K, E, T, PT, LV, ESDV). Where the shape and the tag disagree, trust the tag.
5. **Separate physical from logical.** Shared-display bubbles (a line through the circle) are DCS or PLC functions, not physical items. Field bubbles and actuated valves are physical.
6. **Use line numbers as data.** `8"-PG-2101-D6A-N` gives size, service, sequence, piping class and insulation. Put the line number in the line's `tag` and they are read from it.
7. **Follow lines across sheets** through off-page connectors. The same line number on both sheets is one line.

## Lists, datasheets and notes

- **Line and equipment lists** are the best source of sizes and services. When you have one, prefer it to values read off a drawing.
- **Datasheets:** the `Datasheet → props` column in [pid-symbols.md](pid-symbols.md) says which field sets which prop.
- **Emails and notes** often say what the drawings can't: which unit is standby, what is out of scope, what changed after the last revision.
