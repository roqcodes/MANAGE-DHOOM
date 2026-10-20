"""Generate supabase migration for report salesman filter."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MIG = ROOT / "supabase" / "migrations"
OUT = MIG / "20261020180000_report_salesman_filter.sql"

FILTER_JOIN = "      AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)\n"
FILTER_WHERE = "      AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)\n"


def add_param_to_last_sig_line(fn_sql: str) -> str:
    if "p_salesman_id" in fn_sql.split("AS $$", 1)[0]:
        return fn_sql
    return re.sub(
        r"(p_age_max integer DEFAULT NULL)\n\)",
        r"p_age_max integer DEFAULT NULL,\n  p_salesman_id uuid DEFAULT NULL\n)",
        fn_sql,
        count=1,
    )


def patch_customer_aging_functions(fn_sql: str) -> str:
    fn_sql = add_param_to_last_sig_line(fn_sql)
    if "erp_report_matches_salesman" in fn_sql:
        return fn_sql
    return fn_sql.replace(
        "      AND (p_store_id IS NULL OR i.store_id = p_store_id)\n",
        "      AND (p_store_id IS NULL OR i.store_id = p_store_id)\n" + FILTER_JOIN,
        1,
    )


def extract_function(src: str, name: str) -> str:
    pat = rf"(CREATE OR REPLACE FUNCTION public\.{name}\([\s\S]*?\$\$;)"
    m = re.search(pat, src)
    if not m:
        raise SystemExit(f"Missing function {name}")
    return m.group(1)


def patch_sales_fn(fn_sql: str) -> str:
    if "p_salesman_id" in fn_sql.split("AS $$", 1)[0]:
        return fn_sql
    fn_sql = re.sub(
        r"(p_channel text DEFAULT 'all')\n\)",
        r"p_channel text DEFAULT 'all',\n  p_salesman_id uuid DEFAULT NULL\n)",
        fn_sql,
        count=1,
    )
    if "erp_report_matches_salesman" in fn_sql:
        return fn_sql
    needle = "          AND (\n            p_channel = 'all'\n"
    insert = (
        "          AND public.erp_report_matches_salesman(p_salesman_id, i.sales_person_id)\n"
        + needle
    )
    return fn_sql.replace(needle, insert)


def patch_sales_by_salesman(fn_sql: str) -> str:
    fn_sql = patch_sales_fn(fn_sql)
    if "erp_report_matches_salesman(p_salesman_id, c.sales_person_id)" in fn_sql:
        return fn_sql
    fn_sql = fn_sql.replace(
        "LEFT JOIN public.users sp ON sp.id = c.sales_person_id",
        "LEFT JOIN public.erp_salesmen sp ON sp.id = c.sales_person_id",
    )
    return fn_sql.replace(
        "      LEFT JOIN public.erp_salesmen sp ON sp.id = c.sales_person_id\n    ) r",
        "      LEFT JOIN public.erp_salesmen sp ON sp.id = c.sales_person_id\n"
        "      WHERE public.erp_report_matches_salesman(p_salesman_id, c.sales_person_id)\n    ) r",
    )


def main() -> None:
    aging_src = (MIG / "20261017120000_aging_summary_age_filter.sql").read_text(encoding="utf-8")
    details_src = (MIG / "20261019140000_aging_details_age_filter.sql").read_text(encoding="utf-8")
    sales_src = (MIG / "20261020170000_sales_reports_credit_note_alignment.sql").read_text(encoding="utf-8")

    parts: list[str] = [
        "-- Report filters: optional ERP salesman (invoice sales_person_id).\n\nBEGIN;\n",
        """
CREATE OR REPLACE FUNCTION public.erp_report_matches_salesman(
  p_salesman_id uuid,
  p_sales_person_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_salesman_id IS NULL OR p_sales_person_id IS NOT DISTINCT FROM p_salesman_id;
$$;
""",
    ]

    for fn_name in (
        "get_erp_customer_aging_summary_counts",
        "get_erp_customer_aging",
    ):
        fn = extract_function(aging_src, fn_name)
        parts.append(patch_customer_aging_functions(fn))
        parts.append("")

    fn_details = extract_function(details_src, "get_erp_customer_aging_details")
    fn_details = add_param_to_last_sig_line(fn_details)
    if "erp_report_matches_salesman" not in fn_details:
        fn_details = fn_details.replace(
            "      AND (p_store_id IS NULL OR i.store_id = p_store_id)\n",
            "      AND (p_store_id IS NULL OR i.store_id = p_store_id)\n" + FILTER_WHERE,
            1,
        )
        fn_details = fn_details.replace(
            "      u.name AS customer_name,\n",
            "      u.name AS customer_name,\n      COALESCE(sp.name, 'Unassigned') AS salesman_name,\n",
            1,
        )
        fn_details = fn_details.replace(
            "    LEFT JOIN public.stores s ON s.id = i.store_id\n",
            "    LEFT JOIN public.stores s ON s.id = i.store_id\n"
            "    LEFT JOIN public.erp_salesmen sp ON sp.id = i.sales_person_id\n",
            1,
        )
    parts.append(fn_details)
    parts.append("")

    balance = extract_function(
        (MIG / "20261015250000_receivables_payables_show_all_rows.sql").read_text(encoding="utf-8"),
        "get_erp_customer_balance_report",
    )
    balance = re.sub(
        r"(p_search text DEFAULT NULL)\n\)",
        r"p_search text DEFAULT NULL,\n  p_salesman_id uuid DEFAULT NULL\n)",
        balance,
        count=1,
    )
    balance = balance.replace(
        "      AND (p_store_id IS NULL OR i.store_id = p_store_id)\n",
        "      AND (p_store_id IS NULL OR i.store_id = p_store_id)\n" + FILTER_JOIN,
        1,
    )
    parts.append(balance)
    parts.append("")

    summary_details = (MIG / "20261015260000_customer_aging_summary_details.sql").read_text(
        encoding="utf-8"
    )
    m = re.search(
        r"(CREATE OR REPLACE FUNCTION public\.get_erp_customer_aging_summary_customer_details\([\s\S]*?\$\$;)",
        summary_details,
    )
    assert m
    sd = m.group(1)
    sd = re.sub(
        r"(p_store_id uuid DEFAULT NULL)\n\)",
        r"p_store_id uuid DEFAULT NULL,\n  p_salesman_id uuid DEFAULT NULL\n)",
        sd,
        count=1,
    )
    sd = sd.replace(
        "      AND (p_store_id IS NULL OR i.store_id = p_store_id)\n",
        "      AND (p_store_id IS NULL OR i.store_id = p_store_id)\n" + FILTER_WHERE,
        1,
    )
    parts.append(sd)
    parts.append("")

    for fn_name in ("get_erp_sales_by_customer", "get_erp_sales_by_item"):
        fn = extract_function(sales_src, fn_name)
        parts.append(patch_sales_fn(fn))
        parts.append("")

    parts.append(patch_sales_by_salesman(extract_function(sales_src, "get_erp_sales_by_salesman")))
    parts.append("")

    grants = """
GRANT EXECUTE ON FUNCTION public.erp_report_matches_salesman(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_summary_counts(date, uuid, text, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging(date, uuid, text, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_details(date, uuid, date, date, text, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_balance_report(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_customer_aging_summary_customer_details(uuid, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_customer(date, date, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_item(date, date, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_salesman(date, date, uuid, text, uuid) TO authenticated;

COMMIT;
"""
    parts.append(grants)

    OUT.write_text("\n".join(parts), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
