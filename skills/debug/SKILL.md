---
name: debug
description: "Power user: Deep bug investigation. Pass a short description of the problem — error message, unexpected behavior, or failing test. Returns structured root cause analysis with evidence and fix recommendation."
---

# dynos-work: Debug

Spawn the `debugger` agent with the user's prompt as the instruction.

## What to pass

Pass the user's full prompt verbatim as the instruction to the agent. Do not summarize or reformat it.

## Usage

```
/dynos-work:debug <your problem description>
```

Examples:
```
/dynos-work:debug TypeError: Cannot read properties of undefined reading 'id' at UserService.ts:47
/dynos-work:debug the checkout flow always skips the discount calculation when coupon code is applied
/dynos-work:debug test suite: AuthController > login > should return 401 on invalid password is failing
```
