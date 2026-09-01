import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Grafik panel admin. Semua warna dari token tema (netral + aksen oranye) —
 * tidak ada hex/oklch inline, tidak ada palet baru.
 */

const AXIS = {
  stroke: "var(--color-border)",
  tick: { fill: "var(--color-muted-foreground)", fontSize: 11 },
};

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    fontSize: "12px",
    boxShadow: "var(--shadow-md)",
    color: "var(--color-foreground)",
  },
  labelStyle: { color: "var(--color-muted-foreground)", fontSize: "11px" },
};

export interface SeriesPoint {
  label: string;
  projects: number;
  requests: number;
  logins: number;
}

/** Area chart: request AI per hari (14 hari). */
export function RequestsArea({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="gradReq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.32} />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={AXIS.stroke} strokeDasharray="2 6" vertical={false} />
        <XAxis dataKey="label" stroke={AXIS.stroke} tick={AXIS.tick} tickLine={false} interval="preserveStartEnd" />
        <YAxis stroke={AXIS.stroke} tick={AXIS.tick} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Area
          type="monotone"
          dataKey="requests"
          name="Request"
          stroke="var(--color-accent)"
          strokeWidth={2}
          fill="url(#gradReq)"
          animationDuration={420}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Line ganda: proyek dibuat vs login harian. */
export function ActivityLines({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
        <CartesianGrid stroke={AXIS.stroke} strokeDasharray="2 6" vertical={false} />
        <XAxis dataKey="label" stroke={AXIS.stroke} tick={AXIS.tick} tickLine={false} interval="preserveStartEnd" />
        <YAxis stroke={AXIS.stroke} tick={AXIS.tick} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Line
          type="monotone"
          dataKey="projects"
          name="Proyek"
          stroke="var(--color-accent)"
          strokeWidth={2}
          dot={false}
          animationDuration={420}
        />
        <Line
          type="monotone"
          dataKey="logins"
          name="Login"
          stroke="var(--chart-2)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          animationDuration={420}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Bar horizontal: model tersukses (hanya request tanpa error). */
export function ModelBars({
  data,
}: {
  data: { model: string; success: number; error: number; reliability: number }[];
}) {
  const rows = data.map((d) => ({ ...d, short: d.model.split("/").pop()?.slice(0, 18) ?? d.model }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 38)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 18, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={AXIS.stroke} strokeDasharray="2 6" horizontal={false} />
        <XAxis type="number" stroke={AXIS.stroke} tick={AXIS.tick} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="short"
          stroke={AXIS.stroke}
          tick={{ ...AXIS.tick, fontSize: 11 }}
          tickLine={false}
          width={118}
        />
        <Tooltip {...TOOLTIP_STYLE} />
        <Bar dataKey="success" name="Sukses" fill="var(--color-accent)" radius={[0, 6, 6, 0]} animationDuration={420} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut: komposisi status proyek. */
export function StatusDonut({ data }: { data: { status: string; count: number }[] }) {
  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Tooltip {...TOOLTIP_STYLE} />
        <Pie
          data={data}
          dataKey="count"
          nameKey="status"
          innerRadius={54}
          outerRadius={84}
          paddingAngle={2}
          stroke="var(--color-card)"
          strokeWidth={2}
          animationDuration={420}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
