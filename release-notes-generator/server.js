import requestRx from './requestRx';
import rx from 'rx';
import Mustache from 'mustache';
import fs from 'fs';

let username = process.env.JIRA_USERNAME
  , password = process.env.JIRA_PASSWORD
  , url = `https://${username}:${password}@issues.couchbase.com`
  , post_body = {json: true};

let known_issues = 'project = "Couchbase Server" AND fixVersion in (vulcan,5.1.0) AND labels = known_issue AND component in (memcached, couchbase-bucket, tools, fts, view-engine, installer, query)'
  , options = Object.assign({
      body: {
        "jql": known_issues,
        "fields": ["summary", "components", "comment"] /* Fields we need for release notes */
      },
      url: `${url}/rest/api/2/search`
    }, post_body);

let result = {issues: []};
requestRx.post(options)
  .flatMap(result => {
    return rx.Observable.fromArray(result.body.issues);
  })
  .map(issue => {
    /* Find the comment we will display in release notes */
    let comments = issue.fields.comment.comments;
    let rn_comment = comments.filter(comment => {
      let search = comment.body.search('Description for release notes:');
      if (search != -1) {
        return comment;
      }
    });
    return {
      key: issue.key, 
      comment: rn_comment[0] ? rn_comment[0].body : '', 
      components: issue.fields.components
    };
  })
  .subscribe({
    onNext: data => {
      result.issues.push(data);
    },
    onError: error => {
      console.log(new Error(error));
    },
    onCompleted: () => {
      /* Generate the release notes in the build directory */
      let params = Object.assign(result, {query: known_issues});
      fs.readFile('template.html', 'utf8', function (err, data) {
        if (err) {
          return console.log(err);
        }
        fs.writeFile('./build/release-notes.html', Mustache.render(data, params), function(err) {
          if(err) {
            return console.log(err);
          }
          console.log("The file was saved!");
        });
      });
      console.log('Completed')
    }
  });