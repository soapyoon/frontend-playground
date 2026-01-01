import { useEffect, useMemo, useRef, useState } from "react";

type Grid = number[][];

type Direction = "left" | "right" | "up" | "down";

type Tile = {
  id: number;
  value: number;
  row: number;
  col: number;
  merged?: boolean;
  isNew?: boolean;
  moving?: boolean;
};

type MovePlan = {
  targets: Map<number, { row: number; col: number }>;
  finalTiles: Tile[];
  score: number;
  steps: number;
  direction: Direction;
};

const SIZE = 4;
const GAP = 8;
const PAD = 12;
const MOVE_STEP_MS = 90;

const createEmptyGrid = (): Grid =>
  Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0));

const getEmptyCells = (grid: Grid): Array<{ r: number; c: number }> => {
  const cells: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (grid[r][c] === 0) cells.push({ r, c });
    }
  }
  return cells;
};

const gridFromTiles = (tiles: Tile[]): Grid => {
  const grid = createEmptyGrid();
  for (const tile of tiles) {
    grid[tile.row][tile.col] = tile.value;
  }
  return grid;
};

const addRandomTile = (tiles: Tile[], createId: () => number): Tile[] => {
  const grid = gridFromTiles(tiles);
  const empty = getEmptyCells(grid);
  if (empty.length === 0) return tiles;
  const pick = empty[Math.floor(Math.random() * empty.length)];
  const value = Math.random() < 0.9 ? 2 : 4;
  return [
    ...tiles,
    {
      id: createId(),
      value,
      row: pick.r,
      col: pick.c,
      isNew: true,
    },
  ];
};

const hasMoves = (grid: Grid): boolean => {
  if (getEmptyCells(grid).length > 0) return true;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const value = grid[r][c];
      if (r < SIZE - 1 && grid[r + 1][c] === value) return true;
      if (c < SIZE - 1 && grid[r][c + 1] === value) return true;
    }
  }
  return false;
};

const planMove = (
  tiles: Tile[],
  direction: Direction,
  createId: () => number
): { plan: MovePlan | null; moved: boolean } => {
  let score = 0;
  let moved = false;
  let maxDistance = 0;
  const targets = new Map<number, { row: number; col: number }>();
  const finalTiles: Tile[] = [];

  const isHorizontal = direction === "left" || direction === "right";
  const forward = direction === "left" || direction === "up";

  for (let line = 0; line < SIZE; line += 1) {
    const tilesInLine = tiles
      .filter((tile) => (isHorizontal ? tile.row === line : tile.col === line))
      .sort((a, b) =>
        forward
          ? isHorizontal
            ? a.col - b.col
            : a.row - b.row
          : isHorizontal
          ? b.col - a.col
          : b.row - a.row
      );

    const groups: Array<{ tiles: Tile[]; value: number; merged: boolean }> = [];

    for (const tile of tilesInLine) {
      const last = groups[groups.length - 1];
      if (last && !last.merged && last.value === tile.value) {
        last.tiles.push(tile);
        last.value *= 2;
        last.merged = true;
        score += last.value;
        moved = true;
      } else {
        groups.push({ tiles: [tile], value: tile.value, merged: false });
      }
    }

    groups.forEach((group, index) => {
      const position = forward ? index : SIZE - 1 - index;
      const row = isHorizontal ? line : position;
      const col = isHorizontal ? position : line;

      for (const tile of group.tiles) {
        targets.set(tile.id, { row, col });
        const distance = Math.abs(tile.row - row) + Math.abs(tile.col - col);
        maxDistance = Math.max(maxDistance, distance);
        if (distance > 0) moved = true;
      }

      if (group.merged) {
        finalTiles.push({
          id: createId(),
          value: group.value,
          row,
          col,
          merged: true,
        });
      } else {
        const tile = group.tiles[0];
        finalTiles.push({
          ...tile,
          row,
          col,
          merged: false,
          isNew: false,
          moving: false,
        });
      }
    });
  }

  if (!moved) return { plan: null, moved: false };

  return {
    plan: {
      targets,
      finalTiles,
      score,
      steps: Math.max(maxDistance, 1),
      direction,
    },
    moved: true,
  };
};

export default function Home() {
  const idRef = useRef(1);
  const createId = () => idRef.current++;
  const boardRef = useRef<HTMLDivElement | null>(null);
  const moveRef = useRef<MovePlan | null>(null);
  const stepTimeoutRef = useRef<number | null>(null);

  const [tiles, setTiles] = useState<Tile[]>(() => []);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [cellSize, setCellSize] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const canMove = useMemo(() => hasMoves(gridFromTiles(tiles)), [tiles]);

  useEffect(() => {
    if (!canMove) setGameOver(true);
  }, [canMove]);

  useEffect(() => {
    if (hydrated) return;
    let next = addRandomTile([], createId);
    next = addRandomTile(next, createId);
    setTiles(next);
    setHydrated(true);
  }, [hydrated]);

  useEffect(() => {
    if (!tiles.some((tile) => tile.isNew || tile.merged)) return;
    const timer = window.setTimeout(() => {
      setTiles((prev) =>
        prev.map((tile) =>
          tile.isNew || tile.merged ? { ...tile, isNew: false, merged: false } : tile
        )
      );
    }, 90);
    return () => window.clearTimeout(timer);
  }, [tiles]);

  useEffect(() => {
    const update = () => {
      if (!boardRef.current) return;
      const width = boardRef.current.clientWidth - PAD * 2;
      const nextCell = (width - GAP * (SIZE - 1)) / SIZE;
      setCellSize(nextCell);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    return () => {
      if (stepTimeoutRef.current) window.clearTimeout(stepTimeoutRef.current);
    };
  }, []);

  const runStep = () => {
    const active = moveRef.current;
    if (!active) return;

    setTiles((prev) =>
      prev.map((tile) => {
        const target = active.targets.get(tile.id);
        if (!target) return tile;
        let { row, col } = tile;
        if (active.direction === "left" && col > target.col) col -= 1;
        if (active.direction === "right" && col < target.col) col += 1;
        if (active.direction === "up" && row > target.row) row -= 1;
        if (active.direction === "down" && row < target.row) row += 1;
        const moving = row !== target.row || col !== target.col;
        return { ...tile, row, col, moving };
      })
    );

    active.steps -= 1;
    if (active.steps > 0) {
      stepTimeoutRef.current = window.setTimeout(runStep, MOVE_STEP_MS);
      return;
    }

    stepTimeoutRef.current = window.setTimeout(() => {
      const withTile = addRandomTile(active.finalTiles, createId);
      setTiles(withTile);
      setScore((prev) => prev + active.score);
      setIsAnimating(false);
      moveRef.current = null;
    }, MOVE_STEP_MS);
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (gameOver || isAnimating) return;
      const map: Record<string, Direction> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      };
      const direction = map[event.key];
      if (!direction) return;

      event.preventDefault();
      const { plan, moved } = planMove(tiles, direction, createId);
      if (!moved || !plan) return;

      moveRef.current = plan;
      setIsAnimating(true);
      setTiles((prev) =>
        prev.map((tile) => {
          const target = plan.targets.get(tile.id);
          const moving = target ? tile.row !== target.row || tile.col !== target.col : false;
          return { ...tile, moving };
        })
      );
      if (stepTimeoutRef.current) window.clearTimeout(stepTimeoutRef.current);
      stepTimeoutRef.current = window.setTimeout(runStep, 0);
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [tiles, gameOver, isAnimating]);

  const handleRestart = () => {
    let next = addRandomTile([], createId);
    next = addRandomTile(next, createId);
    setTiles(next);
    setScore(0);
    setGameOver(false);
    setIsAnimating(false);
    moveRef.current = null;
    if (stepTimeoutRef.current) window.clearTimeout(stepTimeoutRef.current);
  };

  return (
    <main className="page">
      <div className="panel">
        <div>
          <h1>2048</h1>
          <p className="muted">Use arrow keys. Combine tiles.</p>
        </div>
        <div className="score">
          <span className="label">Score</span>
          <span className="value">{score}</span>
        </div>
        <button className="reset" onClick={handleRestart} type="button">
          New Game
        </button>
      </div>

      <div className="board" role="grid" aria-label="2048 board" ref={boardRef}>
        <div className="grid" aria-hidden="true">
          {Array.from({ length: SIZE * SIZE }).map((_, index) => (
            <div className="cell" key={`bg-${index}`} />
          ))}
        </div>
        <div className="tiles">
          {tiles.map((tile) => (
            <div
              className={`tile ${tile.moving ? "tile--moving" : ""}`}
              role="gridcell"
              key={tile.id}
              style={{
                width: cellSize,
                height: cellSize,
                transform: `translate(${tile.col * (cellSize + GAP)}px, ${tile.row * (cellSize + GAP)}px)`,
                "--move-duration": isAnimating ? `${MOVE_STEP_MS}ms` : "0ms",
              } as React.CSSProperties}
            >
              <div
                className={`tile-inner ${
                  tile.merged ? "tile-inner--merge" : tile.isNew ? "tile-inner--new" : ""
                }`}
              >
                {tile.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {gameOver && (
        <div className="gameover">
          <p>Game over!</p>
          <button className="reset" onClick={handleRestart} type="button">
            Try Again
          </button>
        </div>
      )}
    </main>
  );
}
