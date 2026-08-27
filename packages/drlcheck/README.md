# drlcheck

Fast, deterministic feedback on Drools DRL files for coding agents: compile-check with line-level diagnostics, inspect rules/declared types, and dry-run rule firing with JSON facts — without a full Kogito/Maven project build.

## Requirements

- Java 17+ and Maven on PATH.
- First use builds a small headless Drools runner (Drools 10.x + Jackson, shaded jar) and caches it in `~/.cache/drlcheck/` — run `drlcheck setup` once to prepay that. Override the cache with `DRLCHECK_CACHE`, or point at a prebuilt jar with `DRLCHECK_JAR`.

## Usage

```sh
drlcheck setup                              # one-time: build + cache the Drools runner

drlcheck compile <files...> [--json]        # diagnostics with line/column; exit 1 on errors
drlcheck describe <files...> [--json]       # rules + declared fact types (with fields)

# dry-run: insert facts, fire all rules, see what fired and the resulting facts
drlcheck run <files...> --facts '[{"type":"Applicant","data":{"age":30,"income":9000}}]' [--json]
drlcheck run <files...> --facts @facts.json
```

Fact `type` may be the declared type's simple name (`Applicant`) or fully qualified name (`rules.discount.Applicant`); `data` sets the declared fields. `run --json` reports `fired[]` (in firing order), `firedCount`, and `factsAfter[]` with each fact's field values after rule execution.

## Example

```sh
$ drlcheck run discount.drl --facts '[{"type":"Applicant","data":{"name":"Ada","age":30,"income":9000}}]'
fired 2 rule(s):
  - Adults are approved  (rules.discount)
  - High income gets discount  (rules.discount)
facts after firing:
  - rules.discount.Applicant: {"name":"Ada","income":9000,"discount":20,"approved":true,"age":30}
```

## Development

```sh
npm run build   # strict typecheck + esbuild bundle to dist/cli.cjs
npm test        # requires java; builds/reuses the runner jar
```
