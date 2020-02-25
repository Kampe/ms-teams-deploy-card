import { getInput, setFailed } from "@actions/core";
import { Octokit } from "@octokit/rest";
import fetch from "node-fetch";
import moment from "moment-timezone";

const escapeMarkdownTokens = (text: string) =>
  text
    .replace(/\n\ {1,}/g, "\n ")
    .replace(/\_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\|/g, "\\|")
    .replace(/#/g, "\\#")
    .replace(/-/g, "\\-")
    .replace(/>/g, "\\>");

const run = async () => {
  const webhookUri = getInput("webhook-uri");
  const githubToken = getInput("github-token");
  const summary = getInput("deploy-title") || "Github Actions CI";
  const timezone = getInput("timezone") || "UTC";
  const allowedFileLen = parseInt(getInput("allowed-file-len") || "7");

  const nowFmt = moment()
    .tz(timezone)
    .format("dddd, MMMM Do YYYY, h:mm:ss a z");

  const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  const sha = process.env.GITHUB_SHA || "";
  const ref = process.env.GITHUB_REF || "";
  const runId = process.env.GITHUB_RUN_ID || "";
  const runNum = process.env.GITHUB_RUN_NUMBER || "";
  const eventName = process.env.GITHUB_EVENT_NAME || "";
  const params = { owner, repo, ref: sha };
  const branchUrl = `https://github.com/${params.owner}/${params.repo}/tree/${ref}`;
  console.log(
    "Workflow run information: ",
    JSON.stringify(
      { ...params, branch: branchUrl, runId, runNum },
      undefined,
      2
    )
  );

  const octokit = new Octokit({ auth: `token ${githubToken}` });
  const commit = await octokit.repos.getCommit(params);

  const filesChanged = commit.data.files
    .slice(0, allowedFileLen)
    .map(
      (file: any) =>
        `[${escapeMarkdownTokens(file.filename)}](${file.blob_url}) (${
          file.changes
        } changes)`
    );

  let filesToDisplay = "* " + filesChanged.join("\n\n* ");
  if (commit.data.files.length > 7) {
    const moreLen = commit.data.files.length - 7;
    filesToDisplay += `\n\n* and [${moreLen} more files](${commit.data.html_url}) changed`;
  }

  const author = commit.data.author;
  const sections = [
    {
      facts: [
        {
          name: "Event name & type:",
          value: "`" + eventName.toUpperCase() + "`"
        },
        {
          name: "Commit message:",
          value: escapeMarkdownTokens(commit.data.commit.message)
        },
        {
          name: "Repository & branch:",
          value: `[${branchUrl}](${branchUrl})`
        },
        {
          name: "Files changed:",
          value: filesToDisplay
        }
      ],
      potentialAction: [
        {
          "@context": "http://schema.org",
          target: [
            `https://github.com/${params.owner}/${params.repo}/actions/runs/${runId}`
          ],
          "@type": "ViewAction",
          name: "View build/deploy status"
        },
        {
          "@context": "http://schema.org",
          target: [commit.data.html_url],
          "@type": "ViewAction",
          name: "Review commit diffs"
        }
      ],
      activityTitle: `**CI ${runNum} (commit ${sha.substr(0, 7)})**`,
      activityImage: author.avatar_url,
      activitySubtitle: `by ${commit.data.commit.author.name} [(@${author.login})](${author.html_url}) on ${nowFmt}`
    }
  ];
  fetch(webhookUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ summary, sections })
  })
    .then(console.log)
    .catch(console.error);
};

try {
  run();
} catch (error) {
  setFailed(error.message);
}
