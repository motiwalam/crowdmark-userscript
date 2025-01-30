# Crowdmark Userscript

Paste the contents of `script.js` into the browser developer window after logging into Crowdmark.

Run `await getCompleteSummary()` to get a summary of class performance for every assignment in every course. 

Run `await getAllPerfReports()` to get the "performance reports" for every class; this information can sometimes be different from the above (for reasons I don't understand).

## Watching for changes
The following code can watch for changes to crowdmark data and notify you.

```js
// compute complete summary every 60 seconds
const watcher = await watch(getCompleteSummary, 60, diffCompleteSummary);
watcher.data() // see the current data state
// use watcher.stop() to stop the watcher
// or just reload the page
```