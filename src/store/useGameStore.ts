import { create } from 'zustand';
import {
  GridCell,
  ToolType,
  GRID_SIZE,
  DAY_LENGTH,
  FAULT_CHANCE,
  BUILDING_STATS,
  DAY_THRESHOLD,
} from '../utils/constants';
import { calculatePowerNetwork, countPoweredBuildings } from '../utils/powerCalculator';

const STORAGE_KEY = 'floating-island-grid-game-save';

export interface DailyReport {
  dayNumber: number;
  minStoredPower: number;
  longestBlackout: { x: number; y: number; duration: number } | null;
  mostFaultyType: string | null;
  satisfactionChange: number;
  satisfactionReason: string;
  attentionArea: string;
}

interface DailyTracker {
  minStoredPower: number;
  houseBlackoutTicks: Record<string, number>;
  faultCounts: Record<string, number>;
  startSatisfaction: number;
}

interface PersistedState {
  grid: GridCell[][];
  dayTime: number;
  storedPower: number;
  satisfaction: number;
  dayNumber: number;
  dailyReports: DailyReport[];
  dailyTracker: DailyTracker;
}

interface GameState {
  grid: GridCell[][];
  dayTime: number;
  storedPower: number;
  maxStorage: number;
  satisfaction: number;
  selectedTool: ToolType;
  poweredCells: Set<string>;
  totalGeneration: number;
  totalConsumption: number;
  showSettlement: boolean;
  dayNumber: number;
  dailyReports: DailyReport[];
  dailyTracker: DailyTracker;
  setSelectedTool: (tool: ToolType) => void;
  placeOrRemove: (x: number, y: number) => void;
  rotateCell: (x: number, y: number) => void;
  repairCell: (x: number, y: number) => void;
  tick: () => void;
  resetGame: () => void;
  openSettlement: () => void;
  closeSettlement: () => void;
}

function createEmptyGrid(): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push({
        x,
        y,
        type: 'empty',
        rotation: 0,
        powered: false,
        faulty: false,
      });
    }
    grid.push(row);
  }
  return grid;
}

function createDailyTracker(satisfaction: number): DailyTracker {
  return {
    minStoredPower: Infinity,
    houseBlackoutTicks: {},
    faultCounts: {},
    startSatisfaction: satisfaction,
  };
}

function saveToLocalStorage(state: PersistedState): void {
  try {
    const data = JSON.stringify({
      grid: state.grid,
      dayTime: state.dayTime,
      storedPower: state.storedPower,
      satisfaction: state.satisfaction,
      dayNumber: state.dayNumber,
      dailyReports: state.dailyReports,
      dailyTracker: state.dailyTracker,
    });
    localStorage.setItem(STORAGE_KEY, data);
  } catch {
    // ignore storage errors
  }
}

function loadFromLocalStorage(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.grid && Array.isArray(data.grid)) {
      const satisfaction = data.satisfaction ?? 50;
      return {
        grid: data.grid,
        dayTime: data.dayTime ?? 20,
        storedPower: data.storedPower ?? 10,
        satisfaction,
        dayNumber: data.dayNumber ?? 1,
        dailyReports: data.dailyReports ?? [],
        dailyTracker: data.dailyTracker ?? createDailyTracker(satisfaction),
      };
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function recalcGrid(grid: GridCell[][], dayTime: number, storedPower: number) {
  const { poweredCells, totalGeneration, totalConsumption, batteryCapacity } =
    calculatePowerNetwork(grid, dayTime, storedPower);

  const newGrid = grid.map((row) => row.map((c) => ({ ...c })));
  for (let yy = 0; yy < GRID_SIZE; yy++) {
    for (let xx = 0; xx < GRID_SIZE; xx++) {
      newGrid[yy][xx].powered = poweredCells.has(`${xx},${yy}`);
    }
  }

  return { newGrid, poweredCells, totalGeneration, totalConsumption, batteryCapacity };
}

function initGame(): Omit<GameState, keyof GameStateActions> {
  const saved = loadFromLocalStorage();
  const grid = saved ? saved.grid : createEmptyGrid();
  const dayTime = saved ? saved.dayTime : 20;
  const storedPower = saved ? saved.storedPower : 10;
  const satisfaction = saved ? saved.satisfaction : 50;
  const dayNumber = saved ? saved.dayNumber : 1;
  const dailyReports = saved ? saved.dailyReports : [];
  const dailyTracker = saved ? saved.dailyTracker : createDailyTracker(satisfaction);

  const { newGrid, poweredCells, totalGeneration, totalConsumption, batteryCapacity } =
    recalcGrid(grid, dayTime, storedPower);

  return {
    grid: newGrid,
    dayTime,
    storedPower,
    maxStorage: batteryCapacity,
    satisfaction,
    selectedTool: 'windmill',
    poweredCells,
    totalGeneration,
    totalConsumption,
    showSettlement: false,
    dayNumber,
    dailyReports,
    dailyTracker,
  };
}

type GameStateActions = Pick<
  GameState,
  | 'setSelectedTool'
  | 'placeOrRemove'
  | 'rotateCell'
  | 'repairCell'
  | 'tick'
  | 'resetGame'
  | 'openSettlement'
  | 'closeSettlement'
>;

export const useGameStore = create<GameState>((set, get) => ({
  ...initGame(),

  setSelectedTool: (tool) => set({ selectedTool: tool }),

  placeOrRemove: (x, y) => {
    const state = get();
    const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));
    const cell = newGrid[y][x];
    const tool = state.selectedTool;

    if (tool === 'remove') {
      if (cell.type !== 'empty') {
        newGrid[y][x] = {
          ...cell,
          type: 'empty',
          rotation: 0,
          powered: false,
          faulty: false,
        };
      }
    } else {
      newGrid[y][x] = {
        ...cell,
        type: tool,
        rotation: tool === 'wire' ? cell.rotation % 6 : 0,
        powered: false,
        faulty: false,
      };
    }

    const result = recalcGrid(newGrid, state.dayTime, state.storedPower);

    const nextState = {
      grid: result.newGrid,
      poweredCells: result.poweredCells,
      totalGeneration: result.totalGeneration,
      totalConsumption: result.totalConsumption,
      maxStorage: result.batteryCapacity,
    };

    saveToLocalStorage({
      grid: result.newGrid,
      dayTime: state.dayTime,
      storedPower: state.storedPower,
      satisfaction: state.satisfaction,
      dayNumber: state.dayNumber,
      dailyReports: state.dailyReports,
      dailyTracker: state.dailyTracker,
    });

    set(nextState);
  },

  rotateCell: (x, y) => {
    const state = get();
    const cell = state.grid[y][x];
    if (cell.type !== 'wire') return;

    const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));
    newGrid[y][x].rotation = (cell.rotation + 1) % 6;

    const result = recalcGrid(newGrid, state.dayTime, state.storedPower);

    const nextState = {
      grid: result.newGrid,
      poweredCells: result.poweredCells,
      totalGeneration: result.totalGeneration,
      totalConsumption: result.totalConsumption,
      maxStorage: result.batteryCapacity,
    };

    saveToLocalStorage({
      grid: result.newGrid,
      dayTime: state.dayTime,
      storedPower: state.storedPower,
      satisfaction: state.satisfaction,
      dayNumber: state.dayNumber,
      dailyReports: state.dailyReports,
      dailyTracker: state.dailyTracker,
    });

    set(nextState);
  },

  repairCell: (x, y) => {
    const state = get();
    const cell = state.grid[y][x];
    if (!cell.faulty) return;

    const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));
    newGrid[y][x].faulty = false;

    const result = recalcGrid(newGrid, state.dayTime, state.storedPower);

    const nextState = {
      grid: result.newGrid,
      poweredCells: result.poweredCells,
      totalGeneration: result.totalGeneration,
      totalConsumption: result.totalConsumption,
      maxStorage: result.batteryCapacity,
    };

    saveToLocalStorage({
      grid: result.newGrid,
      dayTime: state.dayTime,
      storedPower: state.storedPower,
      satisfaction: state.satisfaction,
      dayNumber: state.dayNumber,
      dailyReports: state.dailyReports,
      dailyTracker: state.dailyTracker,
    });

    set(nextState);
  },

  tick: () => {
    const state = get();
    const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));
    const dailyTracker = { ...state.dailyTracker };
    const newFaultCounts = { ...dailyTracker.faultCounts };

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = newGrid[y][x];
        if (cell.type !== 'empty' && !cell.faulty && Math.random() < FAULT_CHANCE) {
          newGrid[y][x].faulty = true;
          newFaultCounts[cell.type] = (newFaultCounts[cell.type] || 0) + 1;
        }
      }
    }
    dailyTracker.faultCounts = newFaultCounts;

    const wasNight = state.dayTime >= DAY_THRESHOLD;
    const newDayTime = (state.dayTime + 0.5) % DAY_LENGTH;
    const isDay = newDayTime < DAY_THRESHOLD;
    const dayStarted = wasNight && isDay;

    const { poweredCells, totalGeneration, totalConsumption, batteryCapacity } =
      calculatePowerNetwork(newGrid, newDayTime, state.storedPower);

    for (let yy = 0; yy < GRID_SIZE; yy++) {
      for (let xx = 0; xx < GRID_SIZE; xx++) {
        newGrid[yy][xx].powered = poweredCells.has(`${xx},${yy}`);
      }
    }

    const netPower = totalGeneration - totalConsumption;
    let newStoredPower = state.storedPower;

    if (batteryCapacity > 0) {
      if (netPower > 0) {
        newStoredPower = Math.min(batteryCapacity, state.storedPower + netPower * 0.3);
      } else if (netPower < 0 && !isDay) {
        const deficit = -netPower;
        const discharge = Math.min(state.storedPower, deficit * 0.5);
        newStoredPower = Math.max(0, state.storedPower - discharge);
      }
    }

    if (newStoredPower < dailyTracker.minStoredPower) {
      dailyTracker.minStoredPower = newStoredPower;
    }

    const newBlackoutTicks = { ...dailyTracker.houseBlackoutTicks };
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = newGrid[y][x];
        if (cell.type === 'house') {
          const key = `${x},${y}`;
          if (!poweredCells.has(key) || cell.faulty) {
            newBlackoutTicks[key] = (newBlackoutTicks[key] || 0) + 1;
          }
        }
      }
    }
    dailyTracker.houseBlackoutTicks = newBlackoutTicks;

    const { houses, poweredHouses, factories, poweredFactories } = countPoweredBuildings(
      newGrid,
      poweredCells
    );
    const totalBuildings = houses + factories;
    const totalPowered = poweredHouses + poweredFactories;
    let coverage = totalBuildings > 0 ? totalPowered / totalBuildings : 1;

    let newSatisfaction = state.satisfaction;
    if (coverage >= 0.8) {
      newSatisfaction = Math.min(100, state.satisfaction + 0.2);
    } else if (coverage >= 0.5) {
      newSatisfaction = Math.min(100, state.satisfaction + 0.05);
    } else {
      newSatisfaction = Math.max(0, state.satisfaction - 0.3);
    }

    let newDayNumber = state.dayNumber;
    let newDailyReports = state.dailyReports;

    if (dayStarted) {
      let longestBlackout: { x: number; y: number; duration: number } | null = null;
      for (const [key, duration] of Object.entries(dailyTracker.houseBlackoutTicks) as [string, number][]) {
        if (!longestBlackout || duration > longestBlackout.duration) {
          const [x, y] = key.split(',').map(Number);
          longestBlackout = { x, y, duration };
        }
      }

      let mostFaultyType: string | null = null;
      let maxFaults = 0;
      for (const [type, count] of Object.entries(dailyTracker.faultCounts) as [string, number][]) {
        if (count > maxFaults) {
          maxFaults = count;
          mostFaultyType = type;
        }
      }

      const satisfactionChange = newSatisfaction - dailyTracker.startSatisfaction;
      let satisfactionReason = '';
      if (satisfactionChange > 0) {
        satisfactionReason = `供电覆盖率${(coverage * 100).toFixed(0)}%，居民满意度提升`;
      } else if (satisfactionChange < 0) {
        satisfactionReason = `供电覆盖率仅${(coverage * 100).toFixed(0)}%，居民满意度下降`;
      } else {
        satisfactionReason = '供电情况平稳，满意度无明显变化';
      }

      let attentionArea = '';
      if (mostFaultyType) {
        const typeNames: Record<string, string> = {
          windmill: '风车',
          house: '住房',
          factory: '工坊',
          battery: '蓄电池',
          wire: '电线',
        };
        attentionArea = `${typeNames[mostFaultyType] || mostFaultyType}故障频发（${maxFaults}次），建议加强维护`;
      } else if (longestBlackout && longestBlackout.duration > 10) {
        attentionArea = `坐标(${longestBlackout.x},${longestBlackout.y})住房长期断电，建议检查线路`;
      } else if (dailyTracker.minStoredPower < 5) {
        attentionArea = '蓄电量偏低，建议增加风车或蓄电池';
      } else {
        attentionArea = '电网运行良好，继续保持';
      }

      const report: DailyReport = {
        dayNumber: state.dayNumber,
        minStoredPower: dailyTracker.minStoredPower === Infinity ? state.storedPower : dailyTracker.minStoredPower,
        longestBlackout,
        mostFaultyType,
        satisfactionChange,
        satisfactionReason,
        attentionArea,
      };

      newDailyReports = [report, ...state.dailyReports].slice(0, 7);
      newDayNumber = state.dayNumber + 1;
      dailyTracker.minStoredPower = Infinity;
      dailyTracker.houseBlackoutTicks = {};
      dailyTracker.faultCounts = {};
      dailyTracker.startSatisfaction = newSatisfaction;
    }

    saveToLocalStorage({
      grid: newGrid,
      dayTime: newDayTime,
      storedPower: newStoredPower,
      satisfaction: newSatisfaction,
      dayNumber: newDayNumber,
      dailyReports: newDailyReports,
      dailyTracker,
    });

    set({
      grid: newGrid,
      dayTime: newDayTime,
      storedPower: newStoredPower,
      maxStorage: batteryCapacity,
      satisfaction: newSatisfaction,
      poweredCells,
      totalGeneration,
      totalConsumption,
      dayNumber: newDayNumber,
      dailyReports: newDailyReports,
    });
  },

  resetGame: () => {
    localStorage.removeItem(STORAGE_KEY);
    const fresh = createEmptyGrid();
    const result = recalcGrid(fresh, 20, 10);
    set({
      grid: result.newGrid,
      dayTime: 20,
      storedPower: 10,
      maxStorage: result.batteryCapacity,
      satisfaction: 50,
      selectedTool: 'windmill',
      poweredCells: result.poweredCells,
      totalGeneration: result.totalGeneration,
      totalConsumption: result.totalConsumption,
      showSettlement: false,
      dayNumber: 1,
      dailyReports: [],
      dailyTracker: createDailyTracker(50),
    });
  },

  openSettlement: () => set({ showSettlement: true }),
  closeSettlement: () => set({ showSettlement: false }),
}));
