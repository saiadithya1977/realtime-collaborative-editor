import { documentModel } from "./document";


export function positionToCRDT(pos) {

  let running = 0;

  for (const block of documentModel.blocks) {

    const { indexMap } = block.crdt.traverse();
    const blockLength = indexMap.length;

   
    if (pos <= running + blockLength) {

      let local = pos - running;

      
      if (local < 0) local = 0;
      if (local > indexMap.length) local = indexMap.length;

      const leftKey =
        local === 0
          ? "ROOT:0"
          : indexMap[Math.min(local - 1, indexMap.length - 1)];

      const rightKey =
        local < indexMap.length
          ? indexMap[local]
          : null;

      return { block, leftKey, rightKey };
    }

    running += blockLength + 1; 
  }

 
  const last = documentModel.blocks.at(-1);
  const { indexMap } = last.crdt.traverse();

  return {
    block: last,
    leftKey: indexMap[indexMap.length - 1] || "ROOT:0",
    rightKey: null
  };
}
