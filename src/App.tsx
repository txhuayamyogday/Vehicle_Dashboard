import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";
import { Camera, Activity, TrendingUp, RefreshCw, Moon, Sun, Menu, X, ChevronRight, Car, Truck, Bike } from "lucide-react";

const API_BASE = "http://100.99.92.88:8020";
const VEHICLE_COLUMNS = [
  "motorcycle_tuk_tuk",
  "sedan_pickup_suv",
  "van",
  "minibus_bus",
  "truck6_truck10_trailer",
];

const COLORS = {
  motorcycle: "#FF6B35",
  sedan: "#004E89",
  van: "#F7931E",
  bus: "#06A77D",
  truck: "#D62828"
};

const GRADIENTS = {
  motorcycle: "from-orange-500 to-red-500",
  sedan: "from-blue-600 to-indigo-700",
  van: "from-yellow-500 to-orange-500",
  bus: "from-emerald-500 to-teal-600",
  truck: "from-red-600 to-pink-600"
};

interface Camera {
  camera_id: number;
  name: string;
}

interface Count {
  start_ts: string;
  motorcycle_tuk_tuk: number;
  sedan_pickup_suv: number;
  van: number;
  minibus_bus: number;
  truck6_truck10_trailer: number;
}

interface Detection {
  ts: string;
  vehicle_class: string;
  conf?: number;
  direction?: string;
}

interface VehicleCounts {
  motorcycle_tuk_tuk: number;
  sedan_pickup_suv: number;
  van: number;
  minibus_bus: number;
  truck6_truck10_trailer: number;
}

interface StatCardProps {
  title: string;
  value: number;
  change?: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  delay: number;
}

function getVehicleCategory(vehicleClass: string): string {
  const mapping: Record<string, string> = {
    motorcycle: "motorcycle_tuk_tuk",
    "tuk-tuk": "motorcycle_tuk_tuk",
    sedan: "sedan_pickup_suv",
    "single-pick-up": "sedan_pickup_suv",
    "pick-up": "sedan_pickup_suv",
    van: "van",
    bus: "minibus_bus",
    minibus: "minibus_bus",
    trailer: "truck6_truck10_trailer",
    truck6: "truck6_truck10_trailer",
    truck10: "truck6_truck10_trailer",
  };
  return mapping[vehicleClass] || "unknown";
}

function formatNumber(n: number | string): string {
  return typeof n === "number" ? n.toLocaleString() : n;
}

function generateIntervals(): string[] {
  const intervals: string[] = ["Full Day"];
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 15, 30, 45]) {
      const start = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      let end_h = h;
      let end_m = m + 15;
      if (end_m === 60) {
        end_h++;
        end_m = 0;
      }
      let end: string;
      if (end_h < 24) {
        end = `${end_h.toString().padStart(2, '0')}:${end_m.toString().padStart(2, '0')}`;
      } else {
        end = "23:59";
      }
      intervals.push(`${start} - ${end}`);
    }
  }
  return intervals;
}

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<number | null>(null);
  const [timeRange, setTimeRange] = useState("live");
  const [fromTime, setFromTime] = useState(new Date(Date.now() - 60 * 60 * 1000));
  const [toTime, setToTime] = useState(new Date());
  const [counts, setCounts] = useState<Count[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedInterval, setSelectedInterval] = useState("Full Day");
  const [recentDetections, setRecentDetections] = useState<Detection[]>([]);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervals = generateIntervals();

  const useLiveMetrics = timeRange === "live";

  // Concise API helper
  const apiGet = async (endpoint: string, params: Record<string, string> = {}): Promise<any> => {
    try {
      const urlParams = new URLSearchParams(params);
      const response = await fetch(`${API_BASE}${endpoint}?${urlParams.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 200) {
        return await response.json();
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (e) {
      const err = e as Error;
      console.error(`${endpoint} Error:`, err.message);
      setError(`${endpoint} failed: ${err.message}`);
      return [];
    }
  };

  // Fetch cameras from API (like Python fetch_cameras)
  useEffect(() => {
    let mounted = true;
    apiGet('/cameras').then(data => {
      if (mounted) {
        setCameras(data as Camera[]);
        if (!data.length) setError('No cameras available');
      }
    }).catch(() => {
      if (mounted) setCameras([]);
    });
    return () => { mounted = false; };
  }, []);

  // Auto-select max camera for live mode
  useEffect(() => {
    if (timeRange !== 'live' || cameras.length === 0) return;
    const maxCamera = cameras.reduce((max, cam) => cam.camera_id > max.camera_id ? cam : max);
    setSelectedCameraId(maxCamera.camera_id);
  }, [cameras, timeRange]);

  // Update time range (like Python time_range logic)
  useEffect(() => {
    const now = new Date();
    if (timeRange === "live") {
      setFromTime(new Date(now.getTime() - 60 * 60 * 1000));
      setToTime(now);
    } else if (timeRange === "1h") {
      setFromTime(new Date(now.getTime() - 60 * 60 * 1000));
      setToTime(now);
    } else if (timeRange === "6h") {
      setFromTime(new Date(now.getTime() - 6 * 60 * 60 * 1000));
      setToTime(now);
    } else if (timeRange === "24h") {
      setFromTime(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      setToTime(now);
    } else if (timeRange === "select_date") {
      // Handled in separate useEffect
    }
  }, [timeRange]);

  // Handle select_date time range
  useEffect(() => {
    if (timeRange !== "select_date") return;

    const date = new Date(selectedDate);
    let from: Date, to: Date;

    if (selectedInterval === "Full Day") {
      from = new Date(date);
      from.setHours(0, 0, 0, 0);
      to = new Date(date);
      to.setHours(23, 59, 59, 999);
    } else {
      const [startStr, endStr] = selectedInterval.split(" - ");
      const [sh, sm] = startStr.split(":").map(Number);
      from = new Date(date);
      from.setHours(sh, sm, 0, 0);

      if (endStr === "23:59") {
        to = new Date(date);
        to.setHours(23, 59, 59, 999);
      } else {
        const [eh, em] = endStr.split(":").map(Number);
        to = new Date(date);
        to.setHours(eh, em, 0, 0);
      }
    }

    setFromTime(from);
    setToTime(to);
  }, [timeRange, selectedDate, selectedInterval]);

  // Fetch counts from API (like Python fetch_counts)
  async function fetchCounts() {
    setLoading(true);
    setError(null);
    const data = await apiGet('/counts', {
      from_time: fromTime?.toISOString() || '',
      to_time: toTime?.toISOString() || '',
      ...(selectedCameraId && { camera_id: selectedCameraId.toString() }),
    });
    setCounts(data as Count[]);
    setLoading(false);
  }

  // Fetch detections from API (like Python fetch_detections)
  async function fetchDetections(limit = 1000, customFromTime: Date | null = null, customToTime: Date | null = null): Promise<Detection[]> {
    const data = await apiGet('/detections', {
      limit: limit.toString(),
      from_time: (customFromTime || fromTime)?.toISOString() || '',
      to_time: (customToTime || toTime)?.toISOString() || '',
      ...(selectedCameraId && { camera_id: selectedCameraId.toString() }),
    });
    return data as Detection[];
  }

  // Initial fetch and auto-refresh (like Python auto_refresh logic)
  useEffect(() => {
    fetchCounts();
    if (timeRange === "live") {
      fetchDetections(1000).then(setDetections);
    }

    if (refreshRef.current) clearInterval(refreshRef.current);
    if (autoRefresh && timeRange === "live") {
      refreshRef.current = setInterval(() => {
        fetchCounts();
        fetchDetections(1000).then(setDetections);
      }, 5000); // 5 seconds like Python
    }
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [fromTime, toTime, selectedCameraId, autoRefresh, timeRange]);

  // Fetch recent detections for live mode display
  useEffect(() => {
    if (!useLiveMetrics) return;
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    fetchDetections(50, fiveMinAgo, now).then(setRecentDetections);
  }, [useLiveMetrics]);

  // Calculate metrics from real data (like Python logic)
  const totalVehicles = (() => {
    if (useLiveMetrics && detections.length > 0) {
      return detections.length;
    }
    if (!counts.length) return 0;
    return counts.reduce((acc, row) => {
      return (
        acc +
        (row.motorcycle_tuk_tuk || 0) +
        (row.sedan_pickup_suv || 0) +
        (row.van || 0) +
        (row.minibus_bus || 0) +
        (row.truck6_truck10_trailer || 0)
      );
    }, 0);
  })();

  const aggregateCounts = (() => {
    const sums: VehicleCounts = {
      motorcycle_tuk_tuk: 0,
      sedan_pickup_suv: 0,
      van: 0,
      minibus_bus: 0,
      truck6_truck10_trailer: 0,
    };
    
    if (useLiveMetrics && detections.length > 0) {
      detections.forEach((d) => {
        const cat = getVehicleCategory(d.vehicle_class);
        if (sums[cat as keyof VehicleCounts] !== undefined) sums[cat as keyof VehicleCounts]! += 1;
      });
    } else {
      counts.forEach((r) => {
        VEHICLE_COLUMNS.forEach((c) => {
          sums[c as keyof VehicleCounts]! += (r[c as keyof Count] as number || 0);
        });
      });
    }
    return sums;
  })();

  const pieData = [
    { name: "Motorcycles", value: aggregateCounts.motorcycle_tuk_tuk, color: COLORS.motorcycle },
    { name: "Cars/SUVs", value: aggregateCounts.sedan_pickup_suv, color: COLORS.sedan },
    { name: "Vans", value: aggregateCounts.van, color: COLORS.van },
    { name: "Buses", value: aggregateCounts.minibus_bus, color: COLORS.bus },
    { name: "Trucks", value: aggregateCounts.truck6_truck10_trailer, color: COLORS.truck }
  ].filter(d => d.value > 0);

  const timeSeriesData = counts
    .sort((a, b) => new Date(a.start_ts).getTime() - new Date(b.start_ts).getTime())
    .map(row => ({
      time: new Date(row.start_ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      fullTime: row.start_ts,
      Motorcycles: row.motorcycle_tuk_tuk || 0,
      Cars: row.sedan_pickup_suv || 0,
      Vans: row.van || 0,
      Buses: row.minibus_bus || 0,
      Trucks: row.truck6_truck10_trailer || 0
    }));

  const handleRefresh = () => {
    fetchCounts();
    if (timeRange === 'live') fetchDetections(1000).then(setDetections);
  };

  const StatCard: React.FC<StatCardProps> = ({ title, value, change, icon: Icon, gradient, delay }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-6 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105 cursor-pointer`}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
            <Icon className="w-6 h-6 text-white" />
          </div>
          {change && (
            <div className="flex items-center gap-1 text-white/90 text-sm">
              <TrendingUp className="w-4 h-4" />
              <span className="font-semibold">{change}</span>
            </div>
          )}
        </div>
        <h3 className="text-white/80 text-sm font-medium mb-1">{title}</h3>
        <p className="text-4xl font-bold text-white">{formatNumber(value)}</p>
      </div>
    </motion.div>
  );

  const inputClass = `px-4 py-2 rounded-xl ${darkMode ? 'bg-slate-800 text-white border-slate-700' : 'bg-white text-gray-900 border-gray-300'} border focus:ring-2 focus:ring-blue-500 outline-none`;

  return (
    <div className={`min-h-screen transition-colors duration-500 ${darkMode ? 'bg-slate-950' : 'bg-gray-50'}`}>
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-1/2 -right-1/2 w-full h-full rounded-full blur-3xl opacity-20 ${darkMode ? 'bg-blue-600' : 'bg-blue-300'}`} />
        <div className={`absolute -bottom-1/2 -left-1/2 w-full h-full rounded-full blur-3xl opacity-20 ${darkMode ? 'bg-purple-600' : 'bg-purple-300'}`} />
      </div>

      <div className="relative z-10 flex">
        {/* Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 25 }}
              className={`fixed left-0 top-0 h-screen w-72 ${darkMode ? 'bg-slate-900/95' : 'bg-white/95'} backdrop-blur-xl border-r ${darkMode ? 'border-slate-800' : 'border-gray-200'} shadow-2xl z-50 overflow-y-auto`}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                      <Activity className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h1 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Traffic AI</h1>
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Real-time Analytics</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <X className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                  </button>
                </div>

                <nav className="space-y-2">
                  {[
                    { icon: Activity, label: "Dashboard", active: true },
                    { icon: Camera, label: "Cameras", active: false },
                    { icon: TrendingUp, label: "Analytics", active: false }
                  ].map((item) => (
                    <motion.button
                      key={item.label}
                      whileHover={{ x: 4 }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                        item.active
                          ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                          : `${darkMode ? 'text-gray-400 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'}` 
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                      {item.active && <ChevronRight className="w-4 h-4 ml-auto" />}
                    </motion.button>
                  ))}
                </nav>

                <div className={`mt-8 p-4 rounded-xl ${darkMode ? 'bg-slate-800/50' : 'bg-gray-100'}`}>
                  <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Active Cameras</h3>
                  {cameras.length > 0 ? (
                    cameras.map(cam => (
                      <div key={cam.camera_id} className="flex items-center gap-2 py-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{cam.name}</span>
                      </div>
                    ))
                  ) : (
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {error ? 'No cameras available' : 'Loading cameras...'}
                    </p>
                  )}
                </div>

                <div className={`mt-4 p-4 rounded-xl ${darkMode ? 'bg-slate-800/50' : 'bg-gray-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Auto Refresh</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {autoRefresh && timeRange === 'live' ? 'Updates every 5 seconds' : 'Manual refresh only'}
                  </p>
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                    <p className="text-xs text-red-400">⚠️ {error}</p>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-72' : 'ml-0'}`}>
          {/* Top Bar */}
          <header className={`sticky top-0 z-40 ${darkMode ? 'bg-slate-900/80' : 'bg-white/80'} backdrop-blur-xl border-b ${darkMode ? 'border-slate-800' : 'border-gray-200'} shadow-lg`}>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                {!sidebarOpen && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className={`p-2 rounded-lg ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} transition-colors`}
                  >
                    <Menu className={`w-6 h-6 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`} />
                  </button>
                )}
                
                <select
                  value={selectedCameraId || ""}
                  onChange={(e) => setSelectedCameraId(e.target.value ? Number(e.target.value) : null)}
                  className={inputClass}
                >
                  <option value="">All Cameras</option>
                  {cameras.map((c) => (
                    <option key={c.camera_id} value={c.camera_id}>
                      {c.camera_id}: {c.name}
                    </option>
                  ))}
                </select>

                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className={inputClass}
                >
                  <option value="live">Live (1h)</option>
                  <option value="1h">Last Hour</option>
                  <option value="6h">Last 6 Hours</option>
                  <option value="24h">Last 24 Hours</option>
                  <option value="select_date">Select Day</option>
                </select>

                {timeRange === "select_date" && (
                  <div className="flex items-center gap-4 mt-2">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className={inputClass}
                    />
                    <select
                      value={selectedInterval}
                      onChange={(e) => setSelectedInterval(e.target.value)}
                      className={inputClass}
                    >
                      {intervals.map((interval) => (
                        <option key={interval} value={interval}>
                          {interval}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                {autoRefresh && timeRange === 'live' && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-500/20 border border-green-500/50 rounded-lg">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-sm font-medium text-green-400">LIVE</span>
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleRefresh}
                  disabled={loading}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl flex items-center gap-2 font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Loading...' : 'Refresh'}
                </motion.button>

                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`p-2 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-gray-100'} transition-colors`}
                >
                  {darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-slate-700" />}
                </button>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="p-6 space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Total Vehicles"
                value={totalVehicles}
                change={undefined}
                icon={Activity}
                gradient="from-blue-500 to-blue-700"
                delay={0}
              />
              <StatCard
                title="Motorcycles"
                value={aggregateCounts.motorcycle_tuk_tuk}
                change={undefined}
                icon={Bike}
                gradient={GRADIENTS.motorcycle}
                delay={0.1}
              />
              <StatCard
                title="Cars & SUVs"
                value={aggregateCounts.sedan_pickup_suv}
                change={undefined}
                icon={Car}
                gradient={GRADIENTS.sedan}
                delay={0.2}
              />
              <StatCard
                title="Trucks"
                value={aggregateCounts.truck6_truck10_trailer}
                change={undefined}
                icon={Truck}
                gradient={GRADIENTS.truck}
                delay={0.3}
              />
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Time Series Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className={`lg:col-span-2 ${darkMode ? 'bg-slate-900/50' : 'bg-white'} backdrop-blur-xl rounded-2xl p-6 border ${darkMode ? 'border-slate-800' : 'border-gray-200'} shadow-xl`}
              >
                <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Traffic Flow Over Time</h3>
                {timeSeriesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={timeSeriesData}>
                      <defs>
                        <linearGradient id="colorCars" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.sedan} stopOpacity={0.8}/>
                          <stop offset="95%" stopColor={COLORS.sedan} stopOpacity={0.1}/>
                        </linearGradient>
                        <linearGradient id="colorMotorcycles" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.motorcycle} stopOpacity={0.8}/>
                          <stop offset="95%" stopColor={COLORS.motorcycle} stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#334155' : '#e5e7eb'} />
                      <XAxis dataKey="time" stroke={darkMode ? '#94a3b8' : '#6b7280'} />
                      <YAxis stroke={darkMode ? '#94a3b8' : '#6b7280'} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                          border: `1px solid ${darkMode ? '#334155' : '#e5e7eb'}`,
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="Cars" stroke={COLORS.sedan} fillOpacity={1} fill="url(#colorCars)" />
                      <Area type="monotone" dataKey="Motorcycles" stroke={COLORS.motorcycle} fillOpacity={1} fill="url(#colorMotorcycles)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-500">
                    {loading ? 'Loading data...' : 'No time series data available'}
                  </div>
                )}
              </motion.div>

              {/* Pie Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className={`${darkMode ? 'bg-slate-900/50' : 'bg-white'} backdrop-blur-xl rounded-2xl p-6 border ${darkMode ? 'border-slate-800' : 'border-gray-200'} shadow-xl`}
              >
                <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Vehicle Distribution</h3>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                          border: `1px solid ${darkMode ? '#334155' : '#e5e7eb'}`,
                          borderRadius: '8px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-500">
                    {loading ? 'Loading data...' : 'No distribution data available'}
                  </div>
                )}
              </motion.div>
            </div>

            {/* Live Detections for Live mode */}
            {useLiveMetrics && recentDetections.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className={`${darkMode ? 'bg-slate-900/50' : 'bg-white'} backdrop-blur-xl rounded-2xl p-6 border ${darkMode ? 'border-slate-800' : 'border-gray-200'} shadow-xl`}
              >
                <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Live Detections (Last 5 Minutes)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className={`${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <th className={`px-4 py-3 text-left text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Time</th>
                        <th className={`px-4 py-3 text-left text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Vehicle Class</th>
                        <th className={`px-4 py-3 text-right text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Confidence</th>
                        <th className={`px-4 py-3 text-left text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Direction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentDetections.slice(0, 50).map((det, idx) => (
                        <tr key={idx} className={`border-b ${darkMode ? 'border-slate-800' : 'border-gray-200'} hover:${darkMode ? 'bg-slate-800/50' : 'bg-gray-50'} transition-colors`}>
                          <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {new Date(det.ts).toLocaleTimeString()}
                          </td>
                          <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{det.vehicle_class}</td>
                          <td className={`px-4 py-3 text-sm text-right ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {det.conf ? (det.conf * 100).toFixed(1) + '%' : '-'}
                          </td>
                          <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{det.direction || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* Data Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className={`${darkMode ? 'bg-slate-900/50' : 'bg-white'} backdrop-blur-xl rounded-2xl p-6 border ${darkMode ? 'border-slate-800' : 'border-gray-200'} shadow-xl`}
            >
              <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Detailed Analytics</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={`${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                      <th className={`px-4 py-3 text-left text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Time Period</th>
                      <th className={`px-4 py-3 text-right text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Motorcycles</th>
                      <th className={`px-4 py-3 text-right text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Cars</th>
                      <th className={`px-4 py-3 text-right text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Vans</th>
                      <th className={`px-4 py-3 text-right text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Buses</th>
                      <th className={`px-4 py-3 text-right text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Trucks</th>
                      <th className={`px-4 py-3 text-right text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {counts.length > 0 ? (
                      counts.slice(-15).map((row, idx) => {
                        const rowTotal = (row.motorcycle_tuk_tuk || 0) + (row.sedan_pickup_suv || 0) + (row.van || 0) + (row.minibus_bus || 0) + (row.truck6_truck10_trailer || 0);
                        return (
                          <tr key={idx} className={`border-b ${darkMode ? 'border-slate-800' : 'border-gray-200'} hover:${darkMode ? 'bg-slate-800/50' : 'bg-gray-50'} transition-colors`}>
                            <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {new Date(row.start_ts).toLocaleString()}
                            </td>
                            <td className={`px-4 py-3 text-sm text-right ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{row.motorcycle_tuk_tuk || 0}</td>
                            <td className={`px-4 py-3 text-sm text-right ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{row.sedan_pickup_suv || 0}</td>
                            <td className={`px-4 py-3 text-sm text-right ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{row.van || 0}</td>
                            <td className={`px-4 py-3 text-sm text-right ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{row.minibus_bus || 0}</td>
                            <td className={`px-4 py-3 text-sm text-right ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{row.truck6_truck10_trailer || 0}</td>
                            <td className={`px-4 py-3 text-sm text-right font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{rowTotal}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className={`px-4 py-8 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {loading ? 'Loading data...' : 'No data available'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}