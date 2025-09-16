// Utility methods for set operations
export function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function isSubset(subset: Set<string>, superset: Set<string>): boolean {
  for (const item of subset) {
    if (!superset.has(item)) return false;
  }
  return true;
}

export function setIntersection(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const item of a) {
    if (b.has(item)) result.add(item);
  }
  return result;
}

export function setDifference(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const item of a) {
    if (!b.has(item)) result.add(item);
  }
  return result;
}

export function isEqual(a: any, b: any): boolean {
  // Same reference
  if (a === b) return true;

  // Handle null and undefined
  if (a == null || b == null) return a === b;

  // Different types
  if (typeof a !== typeof b) return false;

  // Handle primitives (string, number, boolean, symbol, bigint)
  if (typeof a !== "object") return a === b;

  // Handle Date objects
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Handle RegExp objects
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }

  // Handle Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Handle Sets
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }

  // Handle Maps
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !isEqual(value, b.get(key))) return false;
    }
    return true;
  }

  // Handle plain objects
  if (a.constructor === Object && b.constructor === Object) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!(key in b) || !isEqual(a[key], b[key])) return false;
    }
    return true;
  }

  // Handle other object types (classes, etc.)
  if (a.constructor === b.constructor) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!(key in b) || !isEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}
