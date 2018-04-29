# Instanode

## Tested endpoints
* adduser
* verify
* Login
* Follows
* Like
* Additem (was it tested with media?)
* Get item





## Things to take note of for later
* db.task function should be called the following way:
```javascript
// https://www.npmjs.com/package/pg-promise#tasks

db.task(function(t) {
    t.one("DO SOME QUERY")
        .then(function() {
            // DO SOMETHING
        }) .catch(function (err) {
            console.log(err);
        });
}) 
    .then (function() {
        // TASK FINISHED
    }) .catch (function(err) {
        console.log(err);
    });

```
* 