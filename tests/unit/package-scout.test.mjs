import assert from "node:assert/strict";
import test from "node:test";

import { auditPackageMetadata, formatAuditReport } from "../../extensions/package-scout/index.ts";
import { readText } from "../helpers.mjs";

test("package scout classifies healthy metadata as consider", () => {
  const audit = auditPackageMetadata(
    {
      name: "pi-example",
      description: "Example Pi package",
      "dist-tags": { latest: "1.2.3" },
      versions: {
        "1.2.3": {
          license: "MIT",
          repository: { type: "git", url: "https://github.com/example/pi-example.git" },
        },
      },
      time: {
        "1.2.3": "2026-04-01T00:00:00.000Z",
        modified: "2026-04-02T00:00:00.000Z",
      },
    },
    new Date("2026-05-01T00:00:00.000Z"),
  );

  assert.equal(audit.name, "pi-example");
  assert.equal(audit.version, "1.2.3");
  assert.equal(audit.license, "MIT");
  assert.equal(audit.repository, "https://github.com/example/pi-example.git");
  assert.equal(audit.ageDays, 30);
  assert.equal(audit.riskStatus, "consider");
  assert.deepEqual(audit.risks, ["metadata looks healthy; still inspect source before installing"]);
});

test("package scout classifies missing metadata as audit needed", () => {
  const audit = auditPackageMetadata(
    {
      name: "pi-unknown",
      "dist-tags": { latest: "0.1.0" },
      versions: { "0.1.0": {} },
      time: { "0.1.0": "2026-01-01T00:00:00.000Z" },
    },
    new Date("2026-05-01T00:00:00.000Z"),
  );

  assert.equal(audit.riskStatus, "audit needed");
  assert.ok(audit.risks.includes("missing license metadata"));
  assert.ok(audit.risks.includes("missing repository metadata"));
});

test("package scout classifies deprecated or stale packages as avoid", () => {
  const audit = auditPackageMetadata(
    {
      name: "pi-old",
      "dist-tags": { latest: "1.0.0" },
      versions: { "1.0.0": { license: "MIT", repository: "https://github.com/example/pi-old", deprecated: "Use another package" } },
      time: { "1.0.0": "2023-01-01T00:00:00.000Z" },
    },
    new Date("2026-05-01T00:00:00.000Z"),
  );

  assert.equal(audit.riskStatus, "avoid");
  assert.ok(audit.risks.some((risk) => risk.includes("deprecated")));
  assert.ok(audit.risks.includes("latest publish is older than 2 years"));
});

test("package scout report states metadata-only audit and risk status", () => {
  const text = formatAuditReport([
    {
      name: "pi-example",
      version: "1.0.0",
      license: "MIT",
      repository: "https://github.com/example/pi-example",
      publishedAt: "2026-04-01T00:00:00.000Z",
      ageDays: 30,
      modifiedAt: "2026-04-02T00:00:00.000Z",
      riskStatus: "consider",
      risks: ["metadata looks healthy; still inspect source before installing"],
    },
  ]);

  assert.ok(text.includes("Metadata only. No packages were installed."));
  assert.ok(text.includes("Risk status: consider"));
  assert.ok(text.includes("License: MIT"));
});

test("package scout is documented and exposed as a command/tool", () => {
  const source = readText("extensions/package-scout/index.ts");
  const readme = readText("README.md");
  const docsIndex = readText("docs/extensions/index.md");
  const docs = readText("docs/extensions/package-scout.md");

  assert.ok(source.includes('pi.registerCommand("package-scout"'));
  assert.ok(source.includes('name: "package_scout"'));
  assert.ok(readme.includes("extensions/package-scout/"));
  assert.ok(readme.includes("/package-scout"));
  assert.ok(docsIndex.includes("package_scout"));
  assert.ok(docs.includes("never installs packages"));
});
