# Session Context

## User Prompts

### Prompt 1

this branch is a fork.  I wish to now break the fork and mkae it standalone for me

### Prompt 2

use the github api to detach it

Keep history
Rename it to something you like
close all issues and delete releases

### Prompt 3

yes, go ahead

### Prompt 4

done, continue

### Prompt 5

update the readme with the new repo name

### Prompt 6

# gh-ship: Branch → Commit → PR → CI → Merge → CI

> **GitHub repos only.** Before doing anything, confirm the repo has a GitHub remote (`git remote -v`).
> If the remote is Azure DevOps or anything other than `github.com`, stop and tell the user this command does not apply — use the ADO MCP tools instead.

Ship the current working changes end-to-end on GitHub. Run each phase in order, stopping if anything fails.

## Phase 1: Branch

Check current branch with `git branch --show-current`.

- I...

