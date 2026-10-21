/**
 * JSON Repository — Centralized data access layer for all JSON files.
 * All file I/O goes through this layer, NOT directly from controllers.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');

// Prefix counters cache
const counters = {};

/**
 * Generate a padded sequential ID like EMP-000001
 */
function generateId(prefix, existingRecords) {
  if (!counters[prefix]) {
    // Derive current max from existing records
    let max = 0;
    existingRecords.forEach((r) => {
      if (r.id && r.id.startsWith(prefix + '-')) {
        const num = parseInt(r.id.split('-')[1], 10);
        if (num > max) max = num;
      }
    });
    counters[prefix] = max;
  }
  counters[prefix]++;
  return `${prefix}-${String(counters[prefix]).padStart(6, '0')}`;
}

/**
 * Get the full path for a data file
 */
function filePath(name) {
  return path.join(config.dataDir, `${name}.json`);
}

/**
 * Read all records from a JSON data file
 */
function readAll(name) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify([], null, 2));
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Write all records to a JSON data file (atomic write)
 */
function writeAll(name, data) {
  const fp = filePath(name);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, fp);
}

/**
 * Find a single record by ID
 */
function findById(name, id) {
  return readAll(name).find((r) => r.id === id) || null;
}

/**
 * Find records matching a predicate
 */
function findWhere(name, predicate) {
  return readAll(name).filter(predicate);
}

/**
 * Create a new record with auto-generated ID and timestamps
 */
function create(name, idPrefix, data) {
  const all = readAll(name);
  const newRecord = {
    ...data,
    id: data.id || generateId(idPrefix, all),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  all.push(newRecord);
  writeAll(name, all);
  return newRecord;
}

/**
 * Update a record by ID (partial update / merge)
 */
function update(name, id, data) {
  const all = readAll(name);
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...data, id, updatedAt: new Date().toISOString() };
  writeAll(name, all);
  return all[idx];
}

/**
 * Delete a record by ID (hard delete)
 */
function remove(name, id) {
  const all = readAll(name);
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  writeAll(name, all);
  return true;
}

/**
 * Soft-delete / archive a record
 */
function archive(name, id) {
  return update(name, id, { archived: true, archivedAt: new Date().toISOString() });
}

/**
 * Search records across specified fields
 */
function search(name, query, fields) {
  const q = query.toLowerCase();
  return readAll(name).filter((r) =>
    fields.some((f) => {
      const val = r[f];
      return val && String(val).toLowerCase().includes(q);
    })
  );
}

/**
 * Paginate and filter records
 */
function paginate(records, page = 1, limit = 20) {
  const total = records.length;
  const pages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  return {
    data: records.slice(offset, offset + limit),
    pagination: { total, page, pages, limit },
  };
}

module.exports = {
  readAll,
  writeAll,
  findById,
  findWhere,
  create,
  update,
  remove,
  archive,
  search,
  paginate,
  generateId,
  uuidv4,
};
