import { useState } from 'react';
import { DailyReport } from '@/store/useGameStore';
import { BUILDING_STATS } from '@/utils/constants';

interface DailyReportPanelProps {
  reports: DailyReport[];
  isNight: boolean;
}

export function DailyReportPanel({ reports, isNight }: DailyReportPanelProps) {
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());

  const toggleDay = (dayNumber: number) => {
    const newExpanded = new Set(expandedDays);
    if (newExpanded.has(dayNumber)) {
      newExpanded.delete(dayNumber);
    } else {
      newExpanded.add(dayNumber);
    }
    setExpandedDays(newExpanded);
  };

  const getBuildingName = (type: string | null) => {
    if (!type) return '无';
    const stats = BUILDING_STATS[type as keyof typeof BUILDING_STATS];
    return stats ? stats.name : type;
  };

  const getBuildingEmoji = (type: string | null) => {
    if (!type) return '❓';
    const stats = BUILDING_STATS[type as keyof typeof BUILDING_STATS];
    return stats ? stats.emoji : '❓';
  };

  const formatBlackoutDuration = (ticks: number) => {
    const minutes = Math.round(ticks * 0.3);
    if (minutes < 60) {
      return `${minutes}分钟`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}小时${mins > 0 ? mins + '分钟' : ''}`;
  };

  return (
    <div
      className={`rounded-2xl p-4 shadow-xl border backdrop-blur-md ${
        isNight
          ? 'bg-slate-800/80 border-slate-700 text-slate-200'
          : 'bg-white/90 border-white/50 text-gray-700'
      }`}
    >
      <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
        📋 电网体检日报
      </h3>

      {reports.length === 0 ? (
        <p className={`text-xs ${isNight ? 'text-slate-400' : 'text-gray-500'}`}>
          暂无日报，完成一个完整昼夜后生成
        </p>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <div
              key={report.dayNumber}
              className={`rounded-lg border overflow-hidden ${
                isNight ? 'border-slate-600' : 'border-gray-200'
              }`}
            >
              <button
                onClick={() => toggleDay(report.dayNumber)}
                className={`w-full px-3 py-2 text-left text-xs font-medium flex items-center justify-between transition-colors ${
                  isNight
                    ? 'bg-slate-700/50 hover:bg-slate-700'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span>📅</span>
                  <span>第 {report.dayNumber} 天</span>
                </span>
                <span
                  className={`transition-transform duration-200 ${
                    expandedDays.has(report.dayNumber) ? 'rotate-180' : ''
                  }`}
                >
                  ▼
                </span>
              </button>

              <div
                className={`overflow-hidden transition-all duration-200 ${
                  expandedDays.has(report.dayNumber)
                    ? 'max-h-96 opacity-100'
                    : 'max-h-0 opacity-0'
                }`}
              >
                <div className="px-3 py-2 space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-base">🔋</span>
                    <div>
                      <p className="font-medium">最低蓄电量</p>
                      <p className={isNight ? 'text-slate-400' : 'text-gray-500'}>
                        {report.minStoredPower.toFixed(1)} 单位
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="text-base">🏠</span>
                    <div>
                      <p className="font-medium">最长断电住房</p>
                      <p className={isNight ? 'text-slate-400' : 'text-gray-500'}>
                        {report.longestBlackout
                          ? `坐标(${report.longestBlackout.x},${report.longestBlackout.y})，断电${formatBlackoutDuration(report.longestBlackout.duration)}`
                          : '无断电记录'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="text-base">{getBuildingEmoji(report.mostFaultyType)}</span>
                    <div>
                      <p className="font-medium">故障最多建筑类型</p>
                      <p className={isNight ? 'text-slate-400' : 'text-gray-500'}>
                        {getBuildingName(report.mostFaultyType)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="text-base">
                      {report.satisfactionChange >= 0 ? '😊' : '😔'}
                    </span>
                    <div>
                      <p className="font-medium">满意度变化</p>
                      <p className={isNight ? 'text-slate-400' : 'text-gray-500'}>
                        {report.satisfactionChange >= 0 ? '+' : ''}
                        {report.satisfactionChange.toFixed(1)} — {report.satisfactionReason}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="text-base">⚠️</span>
                    <div>
                      <p className="font-medium">建议关注区域</p>
                      <p className={isNight ? 'text-slate-400' : 'text-gray-500'}>
                        {report.attentionArea}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {reports.length > 0 && (
        <div className={`mt-3 pt-3 border-t text-xs ${isNight ? 'border-slate-600 text-slate-400' : 'border-gray-200 text-gray-500'}`}>
          共 {reports.length} 份日报（最多保留7天）
        </div>
      )}
    </div>
  );
}
