export function createCRDT(siteId = "local") {
  let counter = 0;
  const ROOT_KEY = "ROOT:0";
  const nodes = new Map();
  const pending = [];


  nodes.set(ROOT_KEY, {
    id: { siteId: "ROOT", counter: 0 },
    value: "",
    visible: false,
    prev: null,
    next: null
  });

  const createId = () => {
    counter += 1;
    return { siteId, counter };
  };

  const keyFromId = (id) => `${id.siteId}:${id.counter}`;

  const tryInsert = (leftKey, rightKey, value, key, id) => {

   
    if (leftKey && !nodes.has(leftKey)) return false;
    if (rightKey && !nodes.has(rightKey)) return false;

    const node = {
      id,
      value,
      visible: true,
      prev: leftKey,
      next: rightKey
    };

    nodes.set(key, node);

    if (leftKey) nodes.get(leftKey).next = key;
    if (rightKey) nodes.get(rightKey).prev = key;

    return true;
  };

  const processPending = () => {
    let progress = true;

    while (progress) {
      progress = false;

      for (let i = pending.length - 1; i >= 0; i--) {
        const p = pending[i];

        if (tryInsert(p.leftKey, p.rightKey, p.value, p.key, p.id)) {
          pending.splice(i, 1);
          progress = true;
        }
      }
    }
  };

  const insertBetween = (leftKey, rightKey, value, forcedKey = null) => {

    let id, key;

    if (forcedKey) {
      const [siteId, counter] = forcedKey.split(":");
      id = { siteId, counter: Number(counter) };
      key = forcedKey;
    } else {
      id = createId();
      key = keyFromId(id);
    }

    
    const success = tryInsert(leftKey, rightKey, value, key, id);

    
    if (!success) {
      pending.push({ leftKey, rightKey, value, key, id });
      return key;
    }

   
    processPending();

    return key;
  };


  const deleteNode = (key) => {
    const node = nodes.get(key);
    if (!node || !node.visible) return;

    node.visible = false;

    
  };

  const traverse = () => {
    let text = "";
    let indexMap = [];

    let curr = nodes.get(ROOT_KEY).next;
    while (curr) {
      const node = nodes.get(curr);
      if (node.visible) {
        indexMap.push(curr);
        text += node.value;
      }
      curr = node.next;
    }

    return { text, indexMap };
  };

  return {
    ROOT_KEY,
    nodes,
    insertBetween,
    deleteNode,
    traverse
  };
}
