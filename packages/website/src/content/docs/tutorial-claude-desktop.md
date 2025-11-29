---
title: "Give Claude Desktop a Memory"
description: Help Claude understand your codebase, projects, and context with a personal knowledge library
section: Tutorials
order: 17
---

You've just joined a new team. The codebase is massive, the wiki is a maze, and everyone keeps saying "oh, that's in the ADRs somewhere." You need answers, but Claude doesn't know anything about *your* specific project.

In this tutorial, you'll build a knowledge library from your project's documentation and connect it to Claude Desktop. By the end, Claude will answer questions like "Why did we choose Postgres over MongoDB?" or "What's the deployment process for staging?" using your actual docs.

**Time required:** ~15 minutes

**The scenario:** You've inherited a codebase called "Nexus" — a payments platform with years of history, dozens of services, and tribal knowledge scattered across READMEs, ADRs, wiki exports, and onboarding docs.

## What You'll Build

A searchable library containing:

- Architecture Decision Records (ADRs)
- Service READMEs
- Wiki/Confluence exports
- Onboarding documentation
- Team conventions and standards

Once connected, you can ask Claude things like:

> "What's the retry logic for failed payments?"

And get answers grounded in your actual documentation:

> Based on the payment-service README and ADR-015, failed payments use exponential backoff with a maximum of 5 retries over 24 hours. The retry intervals are 1min, 5min, 30min, 2hr, and 24hr. After exhausting retries, the payment is marked as `FAILED_PERMANENT` and triggers an alert to the on-call engineer...

## Prerequisites

- Node.js 20 or later
- Claude Desktop installed
- A folder of project documentation (we'll create sample docs if you don't have any)

## Step 1: Gather Your Documentation

Create a folder structure for your project knowledge:

```bash
mkdir -p nexus-docs/{adrs,services,wiki,onboarding}
```

### Architecture Decision Records

ADRs capture the "why" behind technical decisions. Create a sample:

```bash
cat > nexus-docs/adrs/ADR-015-payment-retry-strategy.md << 'EOF'
# ADR-015: Payment Retry Strategy

## Status
Accepted (2023-06-15)

## Context
Failed payments need automatic retry logic. We considered:
1. Fixed interval retries
2. Exponential backoff
3. Smart retry based on failure type

## Decision
We'll use exponential backoff with failure-type awareness:
- Retry intervals: 1min, 5min, 30min, 2hr, 24hr
- Network errors: full retry sequence
- Card declined: no retry (immediate permanent failure)
- Insufficient funds: retry at 24hr intervals only

## Consequences
- Reduces unnecessary retries for permanent failures
- Improves success rate for transient issues
- Requires failure classification in payment processor integration
EOF
```

### Service Documentation

Add a service README:

````bash
cat > nexus-docs/services/payment-service-README.md << 'EOF'
# Payment Service

Core service handling all payment processing for Nexus.

## Overview
- **Language:** Go 1.21
- **Database:** PostgreSQL 15
- **Message Queue:** RabbitMQ
- **External APIs:** Stripe, PayPal, Adyen

## Key Endpoints

### POST /api/v1/payments
Creates a new payment intent.

```json
{
  "amount": 1000,
  "currency": "USD",
  "customer_id": "cust_123",
  "payment_method": "card"
}
```

### GET /api/v1/payments/:id
Retrieves payment status and history.

## Retry Logic
See ADR-015 for retry strategy. Key points:
- Max 5 retries over 24 hours
- Exponential backoff: 1m, 5m, 30m, 2h, 24h
- Permanent failures skip retry queue

## Local Development
```bash
make dev        # Start with hot reload
make test       # Run test suite
make migrate    # Run database migrations
```

## Deployment
Deployed via ArgoCD. See wiki/deployment-process.md for details.
EOF
````

### Wiki Export

Add some wiki-style documentation:

````bash
cat > nexus-docs/wiki/deployment-process.md << 'EOF'
# Deployment Process

## Environments
| Environment | Branch | Auto-deploy |
|-------------|--------|-------------|
| Development | main | Yes |
| Staging | main | Yes (after dev) |
| Production | release/* | Manual approval |

## Staging Deployment
1. Merge PR to main
2. CI runs tests and builds Docker image
3. ArgoCD detects new image, deploys to dev
4. After 30min soak, auto-promotes to staging
5. Slack notification to #deployments

## Production Deployment
1. Create release branch: `release/v1.2.3`
2. CI builds and tags image
3. Create deployment PR in `nexus-infra` repo
4. Get approval from on-call engineer
5. Merge PR, ArgoCD deploys
6. Monitor dashboards for 15min

## Rollback
```bash
# Quick rollback to previous version
kubectl rollout undo deployment/payment-service -n payments

# Rollback to specific version
argocd app rollback payment-service <revision>
```

## Emergency Contacts
- On-call: #incident-response Slack channel
- Platform team: @platform-oncall
EOF
````

### Onboarding Docs

````bash
cat > nexus-docs/onboarding/new-engineer-guide.md << 'EOF'
# New Engineer Onboarding

Welcome to Nexus! Here's what you need to know.

## First Week Checklist
- [ ] Get access to GitHub org
- [ ] Join Slack channels: #engineering, #deployments, #incidents
- [ ] Set up local dev environment (see below)
- [ ] Complete security training
- [ ] Shadow an on-call shift

## Local Setup

### Prerequisites
- Docker Desktop
- Go 1.21+
- Node 24+ (for frontend services)
- PostgreSQL client (`psql`)

### Getting Started
```bash
# Clone the monorepo
git clone git@github.com:nexus/platform.git
cd platform

# Start infrastructure
make infra-up  # Starts Postgres, Redis, RabbitMQ

# Run the service you're working on
cd services/payment-service
make dev
```

## Architecture Overview
Nexus is a microservices platform with ~30 services. Key services:
- **payment-service**: Core payment processing
- **customer-service**: Customer data and profiles
- **notification-service**: Email, SMS, push notifications
- **gateway**: API gateway and authentication

Services communicate via:
- REST APIs for synchronous calls
- RabbitMQ for async events
- gRPC for internal high-throughput paths

## Code Style
- Go: follow `go fmt` and our `.golangci.yml`
- TypeScript: Prettier + ESLint config in repo
- Commits: Conventional Commits format
- PRs: Require 1 approval, CI must pass

## Questions?
- Technical: Ask in #engineering or your team channel
- Process: Ask your onboarding buddy
- Urgent: #incident-response
EOF
````

## Step 2: Build the Library

Now build a libragen library from all this documentation:

```bash
libragen build ./nexus-docs \
  --name nexus-knowledge \
  --description "Nexus platform documentation, ADRs, and tribal knowledge"
```

You'll see:

```
Processing files...
  ✓ 4 files processed
  ✓ 28 chunks created
  ✓ Embeddings generated
  ✓ Full-text index built

Library saved: nexus-knowledge-1.0.0.libragen (1.2 MB)
```

## Step 3: Connect to Claude Desktop

Install the libragen MCP server:

```bash
npx -y install-mcp @libragen/mcp
```

This automatically configures Claude Desktop. Restart Claude Desktop to load the new server.

### Verify the Connection

In Claude Desktop, you should see "libragen" in the MCP tools list (click the hammer icon). You can also ask Claude:

> "What libraries do you have access to?"

Claude should respond mentioning `nexus-knowledge`.

## Step 4: Ask Claude About Your Project

Now the magic happens. Ask Claude questions and watch it search your actual docs:

### Understanding Architecture

> "How do services communicate in Nexus?"

Claude searches your library and responds with specifics from your onboarding doc:

> Services in Nexus communicate through three mechanisms:
> 1. **REST APIs** for synchronous request/response calls
> 2. **RabbitMQ** for asynchronous event-driven communication
> 3. **gRPC** for internal high-throughput paths between services
>
> The platform has about 30 microservices, with key ones being payment-service, customer-service, notification-service, and the API gateway...

### Finding Tribal Knowledge

> "Why do we use exponential backoff for payment retries instead of fixed intervals?"

Claude finds ADR-015:

> According to ADR-015 (accepted June 2023), the team chose exponential backoff over fixed intervals for several reasons:
>
> 1. **Reduces unnecessary retries** for permanent failures like declined cards
> 2. **Improves success rates** for transient issues like network errors
> 3. **Failure-type awareness** — different retry strategies based on why the payment failed
>
> For example, card declines don't retry at all (immediate permanent failure), while network errors get the full sequence: 1min, 5min, 30min, 2hr, 24hr...

### Deployment Questions

> "How do I deploy to production?"

Claude walks you through the process from your wiki:

> To deploy to production:
> 1. Create a release branch: `release/v1.2.3`
> 2. CI automatically builds and tags the Docker image
> 3. Create a deployment PR in the `nexus-infra` repo
> 4. Get approval from the on-call engineer
> 5. Merge the PR — ArgoCD handles the actual deployment
> 6. Monitor dashboards for 15 minutes post-deploy
>
> For rollback, you can use: `kubectl rollout undo deployment/payment-service -n payments`

### Onboarding Help

> "I'm new here. What Slack channels should I join?"

> Welcome! Based on the onboarding guide, you should join:
> - **#engineering** — General engineering discussions
> - **#deployments** — Deployment notifications and coordination
> - **#incidents** — Incident response and on-call communication
>
> Your first week, you should also shadow an on-call shift and complete security training...

## Step 5: Keep It Growing

As you learn more about the codebase, add to your library:

### Add Meeting Notes

When you learn something important in a meeting:

```bash
cat > nexus-docs/wiki/payment-v2-migration.md << 'EOF'
# Payment v2 Migration Plan

From architecture review 2024-01-15:

We're migrating from the legacy payment processor to Stripe-only.
Timeline: Q2 2024

Key changes:
- Remove PayPal integration (< 2% of transactions)
- Migrate Adyen merchants to Stripe
- Update webhook handlers
- New reconciliation process

Contact: Sarah (payments team lead)
EOF
```

Rebuild:

```bash
libragen build ./nexus-docs \
  --name nexus-knowledge \
  --description "Nexus platform documentation, ADRs, and tribal knowledge"
```

### Add Code Archaeology Notes

When you figure out why something weird exists:

```bash
cat > nexus-docs/wiki/why-dual-database-writes.md << 'EOF'
# Why We Have Dual Database Writes

Found this during investigation 2024-02-01.

The payment-service writes to both PostgreSQL AND the legacy Oracle database.
This looks like a bug but it's intentional.

**Reason:** The finance team's reporting system still reads from Oracle.
Migration was planned for 2022 but blocked by compliance requirements.

**Status:** Oracle writes can be removed after Project Phoenix completes (ETA Q3 2024).

**Code location:** `internal/repository/payment_repository.go`, line 142
EOF
```

Now when future-you (or a teammate) asks Claude "why does payment-service write to two databases?", they'll get the answer.

## Tips for Maximum Value

### 1. Document the Undocumented

The most valuable additions are things that *aren't* written down yet:

- Why a workaround exists
- Who to ask about specific systems
- What that cryptic error message actually means
- Historical context that explains current decisions

### 2. Use Consistent Language

If your team calls it "the payment service," don't call it "payments-svc" in your docs. Consistent terminology improves search accuracy.

### 3. Include Examples

Real examples (sanitized if needed) help Claude give better answers:

```markdown
## Common Errors

### "PAYMENT_PROCESSOR_TIMEOUT"
Usually means Stripe is slow. Check status.stripe.com.
Typical during Black Friday / high-traffic events.
**Fix:** Usually resolves itself. If persistent, check our Stripe dashboard for rate limiting.
```

### 4. Update Regularly

Set a reminder to rebuild weekly:

```bash
# Add to your shell aliases
alias update-nexus='libragen build ~/work/nexus-docs --name nexus-knowledge --description "Nexus platform docs"'
```

## What You've Accomplished

You now have:

- ✅ A searchable knowledge base of your project's documentation
- ✅ Claude Desktop connected to your actual project context
- ✅ The ability to ask natural language questions and get grounded answers
- ✅ A system that grows smarter as you add more documentation

The next time someone asks "how does X work?", you can either answer from your library or add the answer to it — building institutional knowledge that outlasts any individual team member.

## Next Steps

- [MCP Integration](/docs/mcp) — Advanced MCP configuration
- [Building Libraries](/docs/building) — Chunking strategies for better search
- [CLI Reference](/docs/cli) — All command options
