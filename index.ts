import * as dotenv from "dotenv";
import Octokit from '@octokit/rest';

dotenv.config({ path: `${__dirname}/.env` });
const GITHUB_API_USER = process.env.GITHUB_API_USER!;
const GITHUB_API_TOKEN = process.env.GITHUB_API_TOKEN!;
const GITHUB_ORG = process.env.GITHUB_ORG!;
const FILTER_REPOS = process.env.FILTER_REPOS!.split(",");
const LABEL_PREFIX_FROM = process.env.LABEL_PREFIX_FROM!;
const LABEL_PREFIX_TO = process.env.LABEL_PREFIX_TO!;

const flatten = < T = any > (arr: T[][]) => {
    return arr.reduce((prev : T[], curr : T[]) => {
        return prev.concat(curr);
    }, []);
};

(async () => {
    const octokit = new Octokit({
        auth: `${GITHUB_API_TOKEN}`
    });
    console.log(`Initializing Octokit done : user=${GITHUB_API_USER}`)

    // Get repos
    let repos = (
        await Promise.all(FILTER_REPOS.map((repo_name)=>(octokit.repos.get({ owner: GITHUB_ORG, repo:repo_name }))))
    ).map((resp)=>(resp.data))

    // Get labels
    let repoLabelsPairs = (await Promise.all(repos.map((repo) => 
        (
            octokit.issues.listLabelsForRepo({
                owner: repo.owner.login,
                repo: repo.name,
                per_page: 100,
            }).then((resp)=>({
                repo:repo,
                labels:resp.data.map((l)=>(l.name)).filter((l)=>
                    (LABEL_PREFIX_FROM <= l && l <= LABEL_PREFIX_TO)
                )
            }))
        )
    )))

    // Get pull-requests
    let repo2label2pull_requestsArray = await Promise.all(repoLabelsPairs.map((p)=> (
        Promise.all(p.labels.map((label)=>(
            octokit.issues.listForRepo({
                owner: GITHUB_ORG,
                repo: p.repo.name,
                labels: label,
                state: "all"
            }).then((resp)=>({
                label:label,
                pull_requests: resp.data
            }))
        ))).then((label2pull_requests)=>({
            repo: p.repo,
            label2pull_requests: label2pull_requests
        }))
    )));

    let resultsArrayArray = repo2label2pull_requestsArray.map((repo2label2pull_requests)=>(
        repo2label2pull_requests.label2pull_requests.map((label2pull_requests)=>(
            label2pull_requests.pull_requests.map((pull_request)=>(
                {
                    repo:repo2label2pull_requests.repo.name,
                    label:label2pull_requests.label,
                    title:pull_request.title,
                    url:pull_request.html_url
                }
            ))
        ))
    ))
    let results = flatten(flatten(resultsArrayArray))

    console.log("label\trepo\ttitle\turl")
    results.sort(
        (a,b)=>((a.label > b.label) ? 1 : (a.label < b.label) ? -1 : (a.repo > b.repo) ? 1 : (a.repo < b.repo) ? -1 : 0 )
    ).forEach((r)=>{
        console.log(`${r.label}\t${r.repo}\t${r.title}\t${r.url}`)
    })
})()
