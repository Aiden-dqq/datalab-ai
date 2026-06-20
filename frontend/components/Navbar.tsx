"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/protocol", label: "① Protocol" },
  { href: "/analyze",  label: "② Analyze"  },
  { href: "/report",   label: "③ Report"   },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="navbar">
      <Link href="/" className="logo">
        🧪 DataLab AI
      </Link>

      <div className="nav-links">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? "active" : ""}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
