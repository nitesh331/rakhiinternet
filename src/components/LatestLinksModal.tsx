import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ExternalLink,
  Sparkles,
  Clock,
  Globe,
  Search,
  RefreshCw,
  Share2,
  Copy,
  Check,
  Building2,
  GraduationCap,
  Award,
  Calendar,
  AlertCircle,
  TrendingUp,
  Landmark,
  FileText
} from 'lucide-react';

export interface LatestUpdateItem {
  id?: string;
  title: string;
  link: string;
  pubDate: string;
  formattedDate?: string;
  isToday?: boolean;
  snippet?: string;
  source?: string;
  category?: 'haryana' | 'job' | 'result' | 'admit_card' | 'admission' | 'scholarship';
  categoryLabel?: string;
  organization?: string;
  image?: string;
  isHaryana?: boolean;
}

interface LatestLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobs?: LatestUpdateItem[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

const CATEGORY_TABS = [
  { id: 'all', label: 'All Updates', icon: Sparkles, color: 'from-blue-600 to-cyan-600' },
  { id: 'haryana', label: 'Haryana Govt & HKRN', icon: Landmark, color: 'from-amber-600 to-orange-600' },
  { id: 'job', label: 'Govt Jobs & Bharti', icon: Building2, color: 'from-emerald-600 to-teal-600' },
  { id: 'result', label: 'Results & Merit', icon: Award, color: 'from-purple-600 to-pink-600' },
  { id: 'admit_card', label: 'Admit Card & Exam', icon: Calendar, color: 'from-rose-600 to-red-600' },
  { id: 'admission', label: 'Admissions & Univ', icon: GraduationCap, color: 'from-indigo-600 to-blue-600' },
  { id: 'scholarship', label: 'Scholarships & CSC', icon: FileText, color: 'from-violet-600 to-purple-600' },
];

export default function LatestLinksModal({
  isOpen,
  onClose,
  jobs: initialJobs = [],
  isLoading: initialLoading = false
}: LatestLinksModalProps) {
  const [updates, setUpdates] = useState<LatestUpdateItem[]>(initialJobs);
  const [loading, setLoading] = useState(initialLoading);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync with prop updates if provided
  useEffect(() => {
    if (initialJobs && initialJobs.length > 0) {
      setUpdates(initialJobs);
    }
  }, [initialJobs]);

  // Fetch or refresh feed
  const fetchUpdates = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const url = isManualRefresh ? '/api/latest-jobs?refresh=true' : '/api/latest-jobs';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: LatestUpdateItem[] = await res.json();
      if (Array.isArray(data)) {
        setUpdates(data);
        setLastSyncTime(new Date());
      }
    } catch (err) {
      console.error('Error loading latest updates:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Trigger fetch on open if no data
  useEffect(() => {
    if (isOpen && updates.length === 0) {
      fetchUpdates(false);
    }
  }, [isOpen]);

  // Copy link handler
  const handleCopy = (link: string, id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // WhatsApp share handler
  const handleWhatsAppShare = (item: LatestUpdateItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const text = `📢 *Latest Update from Rakhi Internet:*\n\n🔥 *${item.title}*\n🏛️ Organization: ${item.organization || 'Govt Portal'}\n🗓️ Date: ${item.formattedDate || 'Today'}\n\n🔗 *Official Apply / Check Link:* ${item.link}\n\nFor more Haryana Govt & Online Form updates, visit *Rakhi Internet (Narnaund & Jind)*.`;
    const shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank');
  };

  // Filter and search
  const filteredUpdates = useMemo(() => {
    return updates.filter((item) => {
      // Category filter
      const matchesCategory =
        selectedCategory === 'all' ||
        (selectedCategory === 'haryana' && (item.isHaryana || item.category === 'haryana')) ||
        item.category === selectedCategory;

      if (!matchesCategory) return false;

      // Search query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        (item.snippet && item.snippet.toLowerCase().includes(q)) ||
        (item.organization && item.organization.toLowerCase().includes(q)) ||
        (item.source && item.source.toLowerCase().includes(q)) ||
        (item.categoryLabel && item.categoryLabel.toLowerCase().includes(q))
      );
    });
  }, [updates, selectedCategory, searchQuery]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: updates.length };
    for (const tab of CATEGORY_TABS) {
      if (tab.id === 'all') continue;
      if (tab.id === 'haryana') {
        counts.haryana = updates.filter((u) => u.isHaryana || u.category === 'haryana').length;
      } else {
        counts[tab.id] = updates.filter((u) => u.category === tab.id).length;
      }
    }
    return counts;
  }, [updates]);

  // Today's formatted date
  const todayDateString = useMemo(() => {
    return new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, []);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[100]"
          />

          {/* Modal Container */}
          <div className="fixed inset-0 pointer-events-none z-[110] flex items-center justify-center p-2 sm:p-4 md:p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="bg-slate-50 dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-5xl h-[92vh] max-h-[900px] flex flex-col pointer-events-auto overflow-hidden border border-slate-200 dark:border-slate-800"
            >
              {/* Top Header Banner */}
              <div className="relative overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-700 to-cyan-700 p-4 sm:p-6 text-white shrink-0">
                <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute right-1/3 -top-10 w-36 h-36 bg-cyan-400/20 rounded-full blur-xl pointer-events-none" />

                <div className="relative z-10 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner shrink-0">
                      <Sparkles className="w-6 h-6 text-yellow-300 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                          Latest Links & Daily Updates
                        </h2>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 backdrop-blur-sm">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          Auto-Updated Daily
                        </span>
                      </div>
                      <p className="text-blue-100 text-xs sm:text-sm mt-0.5 flex items-center gap-2 flex-wrap font-medium">
                        <span>🗓️ {todayDateString}</span>
                        <span className="opacity-60">•</span>
                        <span>Haryana Govt, Central Jobs, Results, Admit Cards & Admissions</span>
                      </p>
                    </div>
                  </div>

                  {/* Actions (Refresh & Close) */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fetchUpdates(true)}
                      disabled={isRefreshing || loading}
                      className="p-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl transition-all border border-white/15 flex items-center gap-1.5 text-xs font-semibold backdrop-blur-sm cursor-pointer disabled:opacity-50"
                      title="Refresh latest updates now"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">
                        {isRefreshing ? 'Updating...' : 'Sync Now'}
                      </span>
                    </button>
                    <button
                      onClick={onClose}
                      className="p-2.5 text-white/80 hover:bg-white/20 hover:text-white rounded-xl transition-colors cursor-pointer"
                      title="Close"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Controls Bar (Search + Quick Info) */}
              <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search jobs, results, Haryana CET, admit cards, MDU, KUK, SSC, Railways..."
                      className="w-full pl-10 pr-9 py-2.5 text-sm bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Sync Status Badge */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-slate-500 dark:text-slate-400 px-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                      Showing <strong className="text-slate-800 dark:text-white">{filteredUpdates.length}</strong> updates
                    </span>
                    <span className="text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                      Synced {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* Category Filter Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar -mx-1 px-1">
                  {CATEGORY_TABS.map((tab) => {
                    const isSelected = selectedCategory === tab.id;
                    const Icon = tab.icon;
                    const count = categoryCounts[tab.id] || 0;

                    return (
                      <button
                        key={tab.id}
                        onClick={() => setSelectedCategory(tab.id)}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{tab.label}</span>
                        {count > 0 && (
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                              isSelected
                                ? 'bg-white/25 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Scrollable Updates Grid */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 bg-slate-100/60 dark:bg-slate-950/60 custom-scrollbar">
                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <div
                        key={n}
                        className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 animate-pulse flex flex-col sm:flex-row gap-4"
                      >
                        <div className="w-full sm:w-40 h-32 bg-slate-200 dark:bg-slate-800 rounded-xl shrink-0" />
                        <div className="flex-1 space-y-2.5 py-1">
                          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                          <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/2 mt-3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredUpdates.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                    {filteredUpdates.map((item, idx) => {
                      const id = item.id || `item-${idx}`;
                      const isCopied = copiedId === id;

                      // Category Pill color styling
                      let badgeColor = 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800';
                      if (item.category === 'haryana' || item.isHaryana) {
                        badgeColor = 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800';
                      } else if (item.category === 'result') {
                        badgeColor = 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800';
                      } else if (item.category === 'admit_card') {
                        badgeColor = 'bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-800';
                      } else if (item.category === 'admission') {
                        badgeColor = 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
                      } else if (item.category === 'scholarship') {
                        badgeColor = 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-800';
                      }

                      return (
                        <motion.div
                          key={id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(idx * 0.03, 0.4), duration: 0.25 }}
                          className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden relative"
                        >
                          {/* Haryana High-Priority Accent line */}
                          {item.isHaryana && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 z-10" />
                          )}

                          {/* Top Image + Overlay Badges */}
                          <div className="relative h-44 sm:h-48 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                            <img
                              src={item.image || 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80'}
                              alt={item.title}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                // Fallback image if broken
                                (e.target as HTMLImageElement).src =
                                  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80';
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent pointer-events-none" />

                            {/* Badges on Image */}
                            <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider backdrop-blur-md shadow-sm border ${badgeColor}`}
                              >
                                {item.categoryLabel || 'Govt Alert'}
                              </span>

                              {item.isToday && (
                                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/90 text-white backdrop-blur-md shadow-sm">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                  Today
                                </span>
                              )}
                            </div>

                            {/* Organization Badge at bottom of Image */}
                            <div className="absolute bottom-2.5 left-3 right-3 pointer-events-none flex items-center gap-1.5 text-white/95 text-xs font-bold drop-shadow">
                              <Building2 className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                              <span className="truncate">{item.organization || 'Govt Dept'}</span>
                            </div>
                          </div>

                          {/* Content Section */}
                          <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
                            <div>
                              {/* Date and Source */}
                              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1.5 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  {item.formattedDate || 'Recent'}
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium">
                                  <Globe className="w-3 h-3 text-blue-500" />
                                  {item.source || 'All India Govt'}
                                </span>
                              </div>

                              {/* Title */}
                              <h3 className="text-slate-900 dark:text-white font-bold text-sm sm:text-base leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                                {item.title}
                              </h3>

                              {/* Snippet / Description */}
                              {item.snippet && (
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                                  {item.snippet}
                                </p>
                              )}
                            </div>

                            {/* Action Buttons Footer */}
                            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 mt-auto">
                              {/* Open Official Portal Link */}
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                              >
                                <span>Apply / View Notice</span>
                                <ExternalLink className="w-4 h-4" />
                              </a>

                              {/* Share on WhatsApp */}
                              <button
                                onClick={(e) => handleWhatsAppShare(item, e)}
                                className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 rounded-xl transition-all border border-emerald-200 dark:border-emerald-800 active:scale-90 cursor-pointer"
                                title="Share on WhatsApp with students / friends"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>

                              {/* Copy Link */}
                              <button
                                onClick={(e) => handleCopy(item.link, id, e)}
                                className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all border border-slate-200 dark:border-slate-700 active:scale-90 cursor-pointer"
                                title="Copy official notification link"
                              >
                                {isCopied ? (
                                  <Check className="w-4 h-4 text-emerald-600 animate-bounce" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                      <AlertCircle className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-800 dark:text-white">
                        No updates match your search
                      </h4>
                      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                        We could not find any live notifications for "{searchQuery}". Try searching for
                        "Haryana", "HSSC", "Admit Card", "MDU", or clear the search.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('all');
                      }}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                    >
                      Reset Filters & Show All
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Quick Help Bar */}
              <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>
                    Need help filling online forms? Visit <strong>Rakhi Internet (Narnaund / Jind)</strong>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Helpline: +91 98127-12345
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
