<?php

/**
 * Domain Deployment Pipeline Simulation
 *
 * Simulates a multi-stage pipeline with:
 * - State tracking per domain
 * - Retry logic with exponential backoff
 * - Idempotency (won't re-run a stage that already succeeded)
 * - Silent failure detection (verify_live does a real check)
 *
 * Run: php pipeline.php
 */

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

const MAX_RETRIES    = 3;
const BASE_DELAY_SEC = 1;  // In production: 30. Shortened here for demo.

const STAGES = [
    'assign_hosting',
    'configure_dns',
    'deploy_site',
    'verify_live',
];

// Simulated failure rates per stage (0.0 = never fails, 1.0 = always fails)
const FAILURE_RATES = [
    'assign_hosting' => 0.3,   // 30% chance of failure
    'configure_dns'  => 0.4,   // 40% chance of failure
    'deploy_site'    => 0.3,   // 30% chance of failure
    'verify_live'    => 0.2,   // 20% silent failure detection rate
];


// ─────────────────────────────────────────────
// DATABASE (SQLite — zero setup required)
// ─────────────────────────────────────────────

function getDb(): PDO
{
    $db = new PDO('sqlite:/tmp/pipeline_simulation.db');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $db->exec("
        CREATE TABLE IF NOT EXISTS domain_pipeline (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            domain           TEXT NOT NULL UNIQUE,
            current_stage    TEXT NOT NULL DEFAULT 'pending',
            stage_status     TEXT NOT NULL DEFAULT 'pending',
            hosting_provider TEXT DEFAULT NULL,
            retry_count      INTEGER DEFAULT 0,
            last_error       TEXT DEFAULT NULL,
            last_attempted   TEXT DEFAULT NULL,
            completed_at     TEXT DEFAULT NULL,
            created_at       TEXT DEFAULT (datetime('now'))
        )
    ");

    $db->exec("
        CREATE TABLE IF NOT EXISTS pipeline_logs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            domain     TEXT NOT NULL,
            stage      TEXT NOT NULL,
            status     TEXT NOT NULL,
            message    TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    ");

    return $db;
}


// ─────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────

function log_event(PDO $db, string $domain, string $stage, string $status, string $message): void
{
    $db->prepare("
        INSERT INTO pipeline_logs (domain, stage, status, message)
        VALUES (?, ?, ?, ?)
    ")->execute([$domain, $stage, $status, $message]);

    $icon = match($status) {
        'success'  => '✅',
        'failed'   => '❌',
        'retrying' => '🔄',
        'skipped'  => '⏭️ ',
        'started'  => '▶️ ',
        default    => '  ',
    };

    $time = date('H:i:s');
    echo "  [{$time}] {$icon} [{$stage}] {$status} — {$message}\n";
}


// ─────────────────────────────────────────────
// STAGE EXECUTORS
// Simulate real API calls. Each can fail randomly.
// In production, replace these with real HTTP calls.
// ─────────────────────────────────────────────

function execute_assign_hosting(string $domain): array
{
    // Simulate picking a random provider from a pool
    $providers = ['HostGator', 'SiteGround', 'Bluehost', 'DreamHost', 'A2Hosting'];
    $provider  = $providers[array_rand($providers)];

    if (simulateFailure('assign_hosting')) {
        return ['success' => false, 'error' => "Provider API timeout for {$provider}"];
    }

    return ['success' => true, 'provider' => $provider];
}

function execute_configure_dns(string $domain, string $provider): array
{
    if (simulateFailure('configure_dns')) {
        return ['success' => false, 'error' => "DNS configuration rejected by nameserver"];
    }

    return ['success' => true, 'message' => "NS records pointed to {$provider} nameservers"];
}

function execute_deploy_site(string $domain): array
{
    if (simulateFailure('deploy_site')) {
        return ['success' => false, 'error' => "Archive snapshot not found for domain"];
    }

    return ['success' => true, 'message' => "Site rebuilt from archive snapshot"];
}

function execute_verify_live(string $domain): array
{
    // This is the silent failure detector.
    // Even if previous stages reported success, we do a real check here.
    // Simulates an HTTP request to the domain.

    if (simulateFailure('verify_live')) {
        return [
            'success' => false,
            'error'   => "HTTP check failed — site returned 500 or empty response (silent failure caught)",
        ];
    }

    return ['success' => true, 'message' => "HTTP 200 confirmed — site is live"];
}

function simulateFailure(string $stage): bool
{
    return (lcg_value() < FAILURE_RATES[$stage]);
}


// ─────────────────────────────────────────────
// IDEMPOTENCY CHECK
// If a stage already succeeded for this domain, skip it.
// ─────────────────────────────────────────────

function stageAlreadyCompleted(PDO $db, string $domain, string $stage): bool
{
    $row = $db->prepare("
        SELECT COUNT(*) FROM pipeline_logs
        WHERE domain = ? AND stage = ? AND status = 'success'
    ");
    $row->execute([$domain, $stage]);
    return (int) $row->fetchColumn() > 0;
}


// ─────────────────────────────────────────────
// RETRY RUNNER
// Runs a single stage with retry + exponential backoff.
// ─────────────────────────────────────────────

function runStageWithRetry(PDO $db, string $domain, string $stage, array $context = []): bool
{
    // IDEMPOTENCY: skip if already done
    if (stageAlreadyCompleted($db, $domain, $stage)) {
        log_event($db, $domain, $stage, 'skipped', "Already completed — skipping");
        return true;
    }

    log_event($db, $domain, $stage, 'started', "Beginning stage");

    for ($attempt = 1; $attempt <= MAX_RETRIES; $attempt++) {

        // Execute the stage
        $result = match($stage) {
            'assign_hosting' => execute_assign_hosting($domain),
            'configure_dns'  => execute_configure_dns($domain, $context['provider'] ?? 'unknown'),
            'deploy_site'    => execute_deploy_site($domain),
            'verify_live'    => execute_verify_live($domain),
            default          => ['success' => false, 'error' => "Unknown stage: {$stage}"],
        };

        if ($result['success']) {
            // Save provider to context so next stages can use it
            if ($stage === 'assign_hosting' && isset($result['provider'])) {
                $db->prepare("UPDATE domain_pipeline SET hosting_provider = ? WHERE domain = ?")
                   ->execute([$result['provider'], $domain]);
                $context['provider'] = $result['provider'];
            }

            log_event($db, $domain, $stage, 'success', $result['message'] ?? 'Stage completed');
            return true;
        }

        // Stage failed
        $error = $result['error'] ?? 'Unknown error';

        if ($attempt < MAX_RETRIES) {
            $delay = BASE_DELAY_SEC * pow(2, $attempt - 1);  // 1s, 2s, 4s...
            $jitter = rand(0, (int)($delay * 0.2));           // ±20% jitter
            $wait   = $delay + $jitter;

            log_event($db, $domain, $stage, 'retrying',
                "Attempt {$attempt}/{$MAX_RETRIES} failed: {$error}. Retrying in {$wait}s");

            $db->prepare("UPDATE domain_pipeline SET retry_count = retry_count + 1, last_error = ? WHERE domain = ?")
               ->execute([$error, $domain]);

            sleep($wait);
        } else {
            log_event($db, $domain, $stage, 'failed',
                "All {$MAX_RETRIES} attempts failed. Last error: {$error}");
        }
    }

    return false;
}


// ─────────────────────────────────────────────
// MAIN PIPELINE RUNNER
// ─────────────────────────────────────────────

function processDomain(PDO $db, string $domain): void
{
    echo "\n" . str_repeat("─", 60) . "\n";
    echo "  🌐 Processing: {$domain}\n";
    echo str_repeat("─", 60) . "\n";

    // Create or resume pipeline record
    $existing = $db->prepare("SELECT * FROM domain_pipeline WHERE domain = ?");
    $existing->execute([$domain]);
    $record = $existing->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        $db->prepare("INSERT INTO domain_pipeline (domain, current_stage) VALUES (?, 'pending')")
           ->execute([$domain]);
        echo "  New domain — starting fresh pipeline\n";
    } else {
        echo "  Resuming from stage: {$record['current_stage']}\n";
    }

    $context = [];

    // Load existing provider if already assigned
    $providerRow = $db->prepare("SELECT hosting_provider FROM domain_pipeline WHERE domain = ?");
    $providerRow->execute([$domain]);
    $existingProvider = $providerRow->fetchColumn();
    if ($existingProvider) {
        $context['provider'] = $existingProvider;
    }

    // Run each stage in order
    foreach (STAGES as $stage) {
        $db->prepare("UPDATE domain_pipeline SET current_stage = ?, stage_status = 'running', last_attempted = datetime('now') WHERE domain = ?")
           ->execute([$stage, $domain]);

        $success = runStageWithRetry($db, $domain, $stage, $context);

        if (!$success) {
            $db->prepare("UPDATE domain_pipeline SET stage_status = 'failed' WHERE domain = ?")
               ->execute([$domain]);

            echo "\n  💥 Pipeline FAILED at stage: {$stage}\n";
            echo "  Domain moved to manual review queue.\n";
            return;
        }

        // Reload context (provider may have been set during assign_hosting)
        $providerRow->execute([$domain]);
        $provider = $providerRow->fetchColumn();
        if ($provider) {
            $context['provider'] = $provider;
        }

        $db->prepare("UPDATE domain_pipeline SET stage_status = 'success' WHERE domain = ?")
           ->execute([$domain]);
    }

    // All stages passed
    $db->prepare("UPDATE domain_pipeline SET current_stage = 'completed', stage_status = 'success', completed_at = datetime('now') WHERE domain = ?")
       ->execute([$domain]);

    echo "\n  🎉 Pipeline COMPLETE — {$domain} is live!\n";
}


// ─────────────────────────────────────────────
// RESULTS SUMMARY
// ─────────────────────────────────────────────

function printSummary(PDO $db): void
{
    echo "\n" . str_repeat("═", 60) . "\n";
    echo "  PIPELINE SUMMARY\n";
    echo str_repeat("═", 60) . "\n";

    $rows = $db->query("
        SELECT current_stage, stage_status, COUNT(*) as count
        FROM domain_pipeline
        GROUP BY current_stage, stage_status
    ")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as $row) {
        $icon = $row['stage_status'] === 'success' ? '✅' : '❌';
        echo "  {$icon}  {$row['current_stage']} / {$row['stage_status']}: {$row['count']} domain(s)\n";
    }

    echo "\n  FAILURE LOG (stages that failed):\n";
    $failures = $db->query("
        SELECT domain, stage, message, created_at
        FROM pipeline_logs
        WHERE status = 'failed'
        ORDER BY created_at DESC
        LIMIT 10
    ")->fetchAll(PDO::FETCH_ASSOC);

    if (empty($failures)) {
        echo "  No permanent failures recorded.\n";
    } else {
        foreach ($failures as $f) {
            echo "  ❌ [{$f['domain']}] {$f['stage']}: {$f['message']}\n";
        }
    }

    echo str_repeat("═", 60) . "\n";
}


// ─────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────

// Clean DB for fresh demo run
if (file_exists('/tmp/pipeline_simulation.db')) {
    unlink('/tmp/pipeline_simulation.db');
}

$db = getDb();

echo "\n";
echo str_repeat("═", 60) . "\n";
echo "  DOMAIN DEPLOYMENT PIPELINE SIMULATION\n";
echo str_repeat("═", 60) . "\n";

$domains = [
    'vintage-watches-blog.com',
    'recipe-garden-fresh.net',
    'local-plumber-nyc.com',
    'tech-startup-review.io',
    'fitness-tips-daily.org',
];

foreach ($domains as $domain) {
    processDomain($db, $domain);
}

printSummary($db);