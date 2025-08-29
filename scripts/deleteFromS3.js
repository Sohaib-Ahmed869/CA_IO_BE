// scripts/deleteFromS3.js
// Deletes the first N S3 objects from urls.json -> data.documents[*]

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// Reuse existing S3 delete helper used by the app
const { deleteFileFromS3 } = require("../config/s3Config");
const DocumentUpload = require("../models/documentUpload");
let updateApplicationStep;

async function main() {
  try {
    const args = process.argv.slice(2);
    const fileArgIdx = args.indexOf("--file");
    const countArgIdx = args.indexOf("--count");
    const dryRun = args.includes("--dry-run");
    const deleteAll = args.includes("--all");
    const noDb = args.includes("--no-db");

    const jsonPath = fileArgIdx !== -1 && args[fileArgIdx + 1]
      ? args[fileArgIdx + 1]
      : path.resolve(process.cwd(), "urls.json");
    const deleteCount = deleteAll
      ? Infinity
      : (countArgIdx !== -1 && args[countArgIdx + 1]
          ? Number(args[countArgIdx + 1])
          : 2);

    if (!fs.existsSync(jsonPath)) {
      console.error(`❌ File not found: ${jsonPath}`);
      process.exit(1);
    }

    const raw = fs.readFileSync(jsonPath, "utf8");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("❌ Failed to parse JSON:", e.message);
      process.exit(1);
    }

    const docs = parsed?.data?.documents;
    if (!Array.isArray(docs) || docs.length === 0) {
      console.error("❌ No documents found at data.documents in the JSON file.");
      process.exit(1);
    }

    const toDelete = deleteCount === Infinity ? docs.slice() : docs.slice(0, deleteCount);
    console.log(`📄 Source file: ${jsonPath}`);
    console.log(`🔢 Will target first ${toDelete.length} object(s):`);
    toDelete.forEach((d, i) => {
      console.log(`  ${i + 1}) bucket=${d.s3Bucket} key=${d.s3Key}`);
    });

    if (dryRun) {
      console.log("🟡 Dry-run: no deletions performed.");
      process.exit(0);
    }

    // Optionally connect to MongoDB for DB cleanup
    if (!noDb) {
      if (!process.env.MONGODB_URI) {
        console.error("❌ MONGODB_URI not set. Set it or use --no-db to skip DB cleanup.");
        process.exit(1);
      }
      await mongoose.connect(process.env.MONGODB_URI, {
        autoIndex: false,
      });
      try {
        ({ updateApplicationStep } = require("../utils/stepCalculator"));
      } catch (_) {
        // optional
      }
      console.log("🔌 Connected to MongoDB for DB cleanup...");
    } else {
      console.log("⏭️ Skipping DB cleanup (--no-db)");
    }

    for (const doc of toDelete) {
      // Our helper only needs the s3Key; bucket is configured internally
      console.log(`🗑️ Deleting: ${doc.s3Key}`);
      const result = await deleteFileFromS3(doc.s3Key);
      if (result?.success) {
        console.log(`✅ Deleted: ${doc.s3Key}`);
      } else {
        console.error(`❌ Failed to delete ${doc.s3Key}:`, result?.error || result);
      }

      if (!noDb) {
        try {
          // Find all DocumentUpload entries containing this s3Key
          const uploads = await DocumentUpload.find({ "documents.s3Key": doc.s3Key });
          for (const upload of uploads) {
            const before = upload.documents.length;
            upload.documents = upload.documents.filter(d => d.s3Key !== doc.s3Key);
            // If no documents remain, keep record but update counts/status
            await upload.save();
            const after = upload.documents.length;
            console.log(`   🧹 DB cleanup: ${before - after} doc(s) removed from DocumentUpload ${upload._id}`);
            if (typeof updateApplicationStep === "function") {
              try {
                await updateApplicationStep(upload.applicationId.toString());
              } catch (e) {
                console.warn("   ⚠️ Step update skipped:", e.message);
              }
            }
          }
          if (uploads.length === 0) {
            console.log("   ℹ️ No DB records contained this key (already removed or never saved).");
          }
        } catch (e) {
          console.error("   ❌ DB cleanup error:", e.message);
        }
      }
    }

    console.log("🎉 Completed requested deletions.");
    if (!noDb) {
      await mongoose.disconnect();
    }
  } catch (err) {
    console.error("❌ Error:", err.stack || err.message);
    process.exit(1);
  }
}

main();


