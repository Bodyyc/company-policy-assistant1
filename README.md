# Helvig Policy Lab

Comparison site and local Slack bot for the company policy assistant assignment.

The policy database is the 98 records in `shared/policies.json`, taken from the supplied company policy file. `shared/engine.mjs` is the rules search, the TF–IDF vector index, and the unsupported-answer auditor. The site calls the model only from a server function when someone runs a comparison. The Slack bot in `bot/` uses the same engine.

## Site

The deployed site is this app. Ask a question on Compare. The Write-up page has the two required paragraphs and two tables.

## Bot

See `bot/README.md` for the Slack workspace, the testing channel, the invitation to raz@sdu.dk, and how to run the bot locally.
