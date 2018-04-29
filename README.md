# Instanode

## Tested endpoints
* Login
* Follows
* Like
* Additem (need to test without parent)
* Get item (need to fix date format)





## Things to take note of for later
* db.task function should be called the following way:
```javascript
db.task(function(t) {
    t.one("DO SOME QUERY")
        .then(function() {
            // DO SOMETHING
        }) .catch(function (err) {
            console.log(err);
        });
}) .then (function() {
    // TASK FINISHED
}) .catch (function(err) {
    console.log(err);
});
```
* 