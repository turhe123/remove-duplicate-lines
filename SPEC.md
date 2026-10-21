# Remove Duplicate Lines and Sort — specification

**Tagline:** Remove duplicate lines, sort and clean a list in your browser, with a count of what was removed and nothing uploaded.

**Category:** Text & Writing

**Free alternative to:** Dedupelist and TextFixer Remove Duplicate Lines (ad-heavy pages, case and whitespace options missing or confusing, some process text on the server, no way to see which lines were removed)

**Search phrases:** remove duplicate lines, dedupe list online, sort lines alphabetically, remove duplicate lines online free, sort text lines, unique lines only, remove blank lines, list deduplicator

**Allowed libraries:** none (browser APIs only)

**Published at:** https://turhe123.github.io/remove-duplicate-lines/

## Acceptance checks (each must have a test)

- pasting the bundled sample list of 40 lines with repeats shows fewer output lines and a removed count greater than zero
- turning on ignore case treats Apple and apple as duplicates, turning it off keeps both
- choosing sort A to Z orders the output alphabetically and natural sort places item2 before item10
- the removed-lines panel lists each dropped line with the number of times it appeared
- output can be copied and downloaded as a txt file
- works at 390px wide

## Spec

Incumbent and demand. Remove duplicate lines, dedupe a list and sort lines alphabetically are everyday searches by marketers cleaning email or keyword lists, developers tidying logs and config entries, students merging reading lists and analysts cleaning ID columns. The top results such as Dedupelist and TextFixer are cluttered with ads, offer few options such as case sensitivity or whitespace trimming, give no view of what was removed, and some paste lists into forms that are posted to a server, which is a concern when the list contains customer emails or internal hostnames. Spreadsheet users also hunt for this because the Excel remove duplicates dialog is clumsy for plain text. Our version does one job: turn a pasted list into a clean unique list, privately and instantly.

Feature set. Dedupe lines with these options: ignore case (default on), trim leading and trailing spaces on each line before comparing (default on), collapse inner repeated spaces when comparing (off), remove blank lines (default on), and a mode choice of keep first occurrence (default), keep last occurrence, show only lines that were duplicated, or show only lines that appear exactly once. Sorting options: keep original order (default), A to Z, Z to A, natural sort so item2 comes before item10, by length short to long, long to short, reverse order, and shuffle. Locale-aware comparison uses the browser collator so accented letters sort sensibly. A prefix and suffix option and a numbering option are not included, to keep the tool focused. The result panel reports lines in, lines out, duplicates removed and blank lines removed.

UI. Above the fold are two panes: Input on the left and Output on the right, stacking vertically on narrow screens. Both are monospace text areas with line counts. Below or beside the input is a compact option bar with checkboxes and two dropdowns, Mode and Sort, with the defaults above. Output updates live as the user types or changes options, with a short debounce for large inputs. Under the output are Copy, Download as unique-lines.txt, and Swap output into input buttons. A collapsible panel named Removed lines lists each dropped line with a count such as appeared 3 times, which helps users trust the result, and a button copies that list. A file drop target loads txt, csv and log files. Empty state shows a Load sample button. Keyboard use: Ctrl or Cmd plus Enter copies the output, and every control is focusable with visible focus.

Technical approach. Pure JavaScript with no libraries. Split input on any line ending (carriage return plus line feed, line feed or carriage return) and remember the dominant ending so output can match it. Build a comparison key per line by applying trim, space collapse and lower-casing with locale-independent toLowerCase, or normalised with Unicode NFC so composed and decomposed accents match. Use a Map from key to first index, last index and count, which is linear time and handles hundreds of thousands of lines. Sorting uses Intl.Collator with the numeric option for natural order. Shuffle uses crypto.getRandomValues with a Fisher-Yates pass. For inputs above roughly 200000 lines run the work in a Web Worker and show a progress state. Text areas render only the first few thousand lines in the preview if output is huge, with a clear note, while Copy and Download always use the full result through a Blob and object URL. Clipboard uses the async API with a fallback selection copy for Safari.

Edge cases. Files up to about 50 MB are accepted, bigger ones show a message. Mixed line endings are normalised according to a choice. A trailing newline at the end of input must not create a phantom blank line. Lines that differ only by invisible characters such as non-breaking spaces are treated as different unless trim is on, and an info hint explains it. Emoji and astral characters are compared by code point, not by UTF-16 unit. Mobile Safari text areas can be slow with huge pastes, so the debounce is longer there. Nothing is stored or sent, and the page works offline.

Demo data. A fictional list of 40 lines of grocery and bakery supplies for Maple Street Bakery, such as flour, Flour, sugar, butter with trailing spaces, item2 and item10 style SKU codes, several blank lines, and accented entries like crème fraîche repeated in different cases, so every option visibly changes the result.
