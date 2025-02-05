# Crowdmark Userscript
This script contains several useful utility functions to download complete performance data, ~as well as functionality to show assessment grades before they've been released~ (this was patched by crowdmark and no longer works).

Most of the code depends on being run in a browser window that has already been authenticated against the Crowdmark API.

## Recommended usage
Simply paste the contents of `script.js` into the browser developer console after logging into Crowdmark.

The `installScoreUnlocker()` line at the end will have a link with current grading information for every assignment added to the corresponding assessment page. Delete this if you don't want this to happen.

Run `await getCompleteSummary()` to get a summary of class performance for every assignment in every course. 

Run `await getAllPerfReports()` to get the "performance reports" for every class; this information can sometimes be different from the above (for reasons I don't understand).

## As a bookmarklet/userscript
A convenient way to use this script is to add it as a userscript. 

You can also add it as a javascript bookmarklet by deleting all the single line comments (beginning with `//`) and pasting the script into a bookmark, prepending with `javascript:`.
This will create an executable bookmark that installs the score unlocker upon clicking.

## Watching for changes
The following code can watch for changes to crowdmark data and notify you.

```js
// compute complete summary every 60 seconds
const watcher = await watch(getCompleteSummary, 60, diffCompleteSummary);
watcher.data() // see the current data state
// use watcher.stop() to stop the watcher
// or just reload the page
```
