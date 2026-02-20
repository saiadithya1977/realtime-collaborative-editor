import { Block } from "./block";

class DocumentModel {

  constructor() {
    this.blocks = [new Block("block-1")];
  }

  getText() {
    return this.blocks.map(b => b.getText()).join("\n");
  }

  
  localInsert(blockId, leftKey, rightKey, value) {
    const block = this.blocks.find(b => b.id === blockId);
    const key = block.insertBetween(leftKey, rightKey, value);

    return {
      type: "insert",
      blockId,
      leftKey,
      rightKey,
      value,
      key
    };
  }

  
  localDelete(blockId, key) {
    const block = this.blocks.find(b => b.id === blockId);
    block.deleteByKey(key);

    return {
      type: "delete",
      blockId,
      key
    };
  }
}

export const documentModel = new DocumentModel();
