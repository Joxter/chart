#!/usr/bin/env python3
"""Convert CSV files in public/ to JSON, dropping all-zero columns and renaming to descriptive names."""

import csv
import json
import os

PUBLIC = os.path.join(os.path.dirname(__file__), "..", "public")

# Mapping: (original filename) -> (new json name)
FILE_MAP = {
    "calculation.csv": "calc_15min_consumption_2024.json",
    "calculation (1).csv": "calc_15min_pv_2025.json",
    "calculation (2).csv": "calc_15min_partial_2025.json",
    "calculation (3).csv": "calc_15min_generator_2025.json",
    "calculation (4).csv": "calc_15min_battery_2024.json",
    "calculation_per_day.csv": "calc_daily_consumption_2024.json",
    "calculation_per_day (1).csv": "calc_daily_simple_2024.json",
    "calculation_per_day (2).csv": "calc_daily_pv_2024.json",
    "calculation_per_month.csv": "calc_monthly_2024.json",
    "input_profiles.csv": "profiles_15min_consumption_2024.json",
    "input_profiles (1).csv": "profiles_15min_pv_2025.json",
    "input_profiles (2).csv": "profiles_15min_partial_2025.json",
    "input_profiles (3).csv": "profiles_15min_extra_2025.json",
    "input_profiles (4).csv": "profiles_15min_full_2024.json",
}


def parse_value(val: str):
    """Parse a string value to number if possible, keep strings otherwise."""
    val = val.strip()
    if val == "":
        return None
    try:
        f = float(val)
        if f == int(f) and "." not in val:
            return int(val)
        return round(f, 2)
    except ValueError:
        return val


def convert(csv_name: str, json_name: str):
    csv_path = os.path.join(PUBLIC, csv_name)
    json_path = os.path.join(PUBLIC, json_name)

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        rows = list(reader)

    if not rows:
        print(f"  SKIP {csv_name} (empty)")
        return

    headers = list(rows[0].keys())

    # Find all-zero columns
    zero_cols = set()
    for col in headers:
        if col in ("date", "month"):
            zero_cols.add(col)  # drop redundant time cols
            continue
        if col == "timestamps":
            continue
        all_zero = True
        for row in rows:
            val = row[col].strip()
            if val == "":
                continue
            try:
                if float(val) != 0.0:
                    all_zero = False
                    break
            except ValueError:
                all_zero = False
                break
        if all_zero:
            zero_cols.add(col)

    # Build columnar format: Record<string, number[]>
    keep_cols = [c for c in headers if c not in zero_cols]
    columns = {col: [] for col in keep_cols}
    for row in rows:
        for col in keep_cols:
            columns[col].append(parse_value(row[col]))

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(columns, f, separators=(",", ":"))

    orig_cols = len(headers)
    dropped = len(zero_cols)
    n_rows = len(next(iter(columns.values())))
    print(f"  {csv_name} -> {json_name}  ({n_rows} rows, {orig_cols - dropped}/{orig_cols} cols, dropped: {sorted(zero_cols) if zero_cols else 'none'})")


def main():
    print("Converting CSV -> JSON ...\n")
    for csv_name, json_name in FILE_MAP.items():
        csv_path = os.path.join(PUBLIC, csv_name)
        if not os.path.exists(csv_path):
            print(f"  MISSING: {csv_name}")
            continue
        convert(csv_name, json_name)
    print("\nDone.")


if __name__ == "__main__":
    main()
