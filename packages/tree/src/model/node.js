import objectAssign from 'element-ui/src/utils/merge';
import { markNodeData, NODE_KEY } from './util';
import { arrayFindIndex } from 'element-ui/src/utils/util';

export const getChildState = node => {
  let all = true;
  let none = true;
  let allWithoutDisable = true;
  for (let i = 0, j = node.length; i < j; i++) {
    const n = node[i];
    if (n.checked !== true || n.indeterminate) {
      all = false;
      if (!n.disabled) {
        allWithoutDisable = false;
      }
    }
    if (n.checked !== false || n.indeterminate) {
      none = false;
    }
  }
  // 全部checked， 没有一个checked，全部disabled， 部分checked
  return { all, none, allWithoutDisable, half: !all && !none };
};

const reInitChecked = function(node) {
  if (node.childNodes.length === 0 || node.loading) return;

  const {all, none, half} = getChildState(node.childNodes);
  if (all) {
    node.checked = true;
    node.indeterminate = false;
  } else if (half) {
    node.checked = false;
    node.indeterminate = true;
  } else if (none) {
    node.checked = false;
    node.indeterminate = false;
  }

  const parent = node.parent;
  if (!parent || parent.level === 0) return;

  if (!node.store.checkStrictly) {
    reInitChecked(parent);
  }
};

const getPropertyFromData = function(node, prop) {
  const props = node.store.props;
  const data = node.data || {};
  const config = props[prop];

  if (typeof config === 'function') {
    return config(data, node);
  } else if (typeof config === 'string') {
    return data[config];
  } else if (typeof config === 'undefined') {
    const dataProp = data[prop];
    return dataProp === undefined ? '' : dataProp;
  }
};

let nodeIdSeed = 0;

export default class Node {
  /*
    将当前节点添加进nodeMap
    若不是懒加载，则将子节点初始化
   */
  constructor(options) {
    this.id = nodeIdSeed++;
    this.text = null;
    this.checked = false;
    this.indeterminate = false;
    this.data = null;
    this.expanded = false;
    this.parent = null;
    this.visible = true;
    this.isCurrent = false;

    /* {
      data,
      store
    } */
    for (let name in options) {
      if (options.hasOwnProperty(name)) {
        this[name] = options[name];
      }
    }

    // internal
    this.level = 0;
    this.loaded = false;
    this.childNodes = [];
    this.loading = false;

    if (this.parent) {
      this.level = this.parent.level + 1;
    }

    const store = this.store;
    if (!store) {
      throw new Error('[Node]store is required!');
    }
    store.registerNode(this);

    const props = store.props;
    /* 初始化节点的isLeafByUser */
    if (props && typeof props.isLeaf !== 'undefined') {
      const isLeaf = getPropertyFromData(this, 'isLeaf');
      if (typeof isLeaf === 'boolean') {
        this.isLeafByUser = isLeaf;
      }
    }

    /* 非懒加载时，初始化子节点；通过传入的data转化为当前节点的子节点 */
    if (store.lazy !== true && this.data) {
      /* setData方法只有根节点传入data才会有效，非根节点会从当前节点的children中取值，即使传了data也会被忽略 */
      this.setData(this.data);

      if (store.defaultExpandAll) {
        this.expanded = true;
      }
    } else if (this.level > 0 && store.lazy && store.defaultExpandAll) {
      this.expand();
    }
    if (!Array.isArray(this.data)) {
      markNodeData(this, this.data);
    }
    if (!this.data) return;
    const defaultExpandedKeys = store.defaultExpandedKeys;
    const key = store.key;
    if (key && defaultExpandedKeys && defaultExpandedKeys.indexOf(this.key) !== -1) {
      this.expand(null, store.autoExpandParent);
    }

    if (key && store.currentNodeKey !== undefined && this.key === store.currentNodeKey) {
      store.currentNode = this;
      store.currentNode.isCurrent = true;
    }

    /* 处理当前节点的选中逻辑（若当前节点在defaultCheckedKeys范围内，则选中） */
    if (store.lazy) {
      store._initDefaultCheckedNode(this);
    }

    this.updateLeafState();
  }

  setData(data) {
    /* 添加'$treeNodeId'标记 */
    if (!Array.isArray(data)) {
      markNodeData(this, data);
    }

    this.data = data;
    this.childNodes = [];

    let children;
    /* 当前节点为根节点，从data取值来转换为子节点；否则从当前节点的 children 属性取值*/
    if (this.level === 0 && this.data instanceof Array) {
      children = this.data;
    } else {
      children = getPropertyFromData(this, 'children') || [];
    }

    for (let i = 0, j = children.length; i < j; i++) {
      /* 不传入位置的话，将data添加到当前节点的childNodes尾部 */
      this.insertChild({ data: children[i] });
    }
  }

  get label() {
    return getPropertyFromData(this, 'label');
  }

  get key() {
    const nodeKey = this.store.key;
    if (this.data) return this.data[nodeKey];
    return null;
  }

  get disabled() {
    return getPropertyFromData(this, 'disabled');
  }

  get nextSibling() {
    const parent = this.parent;
    if (parent) {
      const index = parent.childNodes.indexOf(this);
      if (index > -1) {
        return parent.childNodes[index + 1];
      }
    }
    return null;
  }

  get previousSibling() {
    const parent = this.parent;
    if (parent) {
      const index = parent.childNodes.indexOf(this);
      if (index > -1) {
        return index > 0 ? parent.childNodes[index - 1] : null;
      }
    }
    return null;
  }

  contains(target, deep = true) {
    const walk = function(parent) {
      const children = parent.childNodes || [];
      let result = false;
      for (let i = 0, j = children.length; i < j; i++) {
        const child = children[i];
        if (child === target || (deep && walk(child))) {
          result = true;
          break;
        }
      }
      return result;
    };

    return walk(this);
  }

  remove() {
    const parent = this.parent;
    if (parent) {
      parent.removeChild(this);
    }
  }

  /* child类型为对象； 将child添加到当前节点的childNodes */
  insertChild(child, index, batch) {
    if (!child) throw new Error('insertChild error: child is required.');

    /* child是普通数据，并不是Node实例 */
    if (!(child instanceof Node)) {
      if (!batch) {
        const children = this.getChildren(true) || [];
        if (children.indexOf(child.data) === -1) {
          if (typeof index === 'undefined' || index < 0) {
            children.push(child.data);
          } else {
            children.splice(index, 0, child.data);
          }
        }
      }
      /* 添加父节点，store，将普通对象转换为Node实例 */
      objectAssign(child, {
        parent: this,
        store: this.store
      });
      child = new Node(child);
    }

    child.level = this.level + 1;

    /* 未传入位置就将节点添加到当前节点的childNodes的尾部 */
    if (typeof index === 'undefined' || index < 0) {
      this.childNodes.push(child);
    } else {
      this.childNodes.splice(index, 0, child);
    }

    this.updateLeafState();
  }

  insertBefore(child, ref) {
    let index;
    if (ref) {
      index = this.childNodes.indexOf(ref);
    }
    this.insertChild(child, index);
  }

  insertAfter(child, ref) {
    let index;
    if (ref) {
      index = this.childNodes.indexOf(ref);
      if (index !== -1) index += 1;
    }
    this.insertChild(child, index);
  }

  removeChild(child) {
    const children = this.getChildren() || [];
    const dataIndex = children.indexOf(child.data);
    if (dataIndex > -1) {
      children.splice(dataIndex, 1);
    }

    const index = this.childNodes.indexOf(child);

    if (index > -1) {
      this.store && this.store.deregisterNode(child);
      child.parent = null;
      this.childNodes.splice(index, 1);
    }

    this.updateLeafState();
  }

  removeChildByData(data) {
    let targetNode = null;

    for (let i = 0; i < this.childNodes.length; i++) {
      if (this.childNodes[i].data === data) {
        targetNode = this.childNodes[i];
        break;
      }
    }

    if (targetNode) {
      this.removeChild(targetNode);
    }
  }

  expand(callback, expandParent) {
    /* 如果expandParent，则节点自底向上进行展开 */
    const done = () => {
      if (expandParent) {
        let parent = this.parent;
        while (parent.level > 0) {
          parent.expanded = true;
          parent = parent.parent;
        }
      }
      this.expanded = true;
      if (callback) callback();
    };

    if (this.shouldLoadData()) {
      this.loadData((data) => {
        if (data instanceof Array) {
          if (this.checked) {
            this.setChecked(true, true);
          } else if (!this.store.checkStrictly) {
            reInitChecked(this);
          }
          done();
        }
      });
    } else {
      done();
    }
  }

  /* 遍历array，创建子节点，添加到当前节点的childNodes的指定位置（默认位置为尾部） */
  doCreateChildren(array, defaultProps = {}) {
    array.forEach((item) => {
      this.insertChild(objectAssign({ data: item }, defaultProps), undefined, true);
    });
  }

  collapse() {
    this.expanded = false;
  }

  shouldLoadData() {
    return this.store.lazy === true && this.store.load && !this.loaded;
  }

  updateLeafState() {
    /* 文档介绍：指定节点是否为叶子节点，仅在指定了 lazy 属性的情况下生效 https://element.eleme.io/#/zh-CN/component/tree；
    那么是不是可以直接 if (!this.store.lazy) return; */
    /* 懒加载并且未展开的节点，通过isLeafByUser来初始化当前是否是叶子节点 */
    if (this.store.lazy === true && this.loaded !== true && typeof this.isLeafByUser !== 'undefined') {
      this.isLeaf = this.isLeafByUser;
      return;
    }
    const childNodes = this.childNodes;
    /* 非懒加载或者已经展开的节点，通过childNodes长度来判断当前是否是叶子节点 */
    if (!this.store.lazy || (this.store.lazy === true && this.loaded === true)) {
      this.isLeaf = !childNodes || childNodes.length === 0;
      return;
    }
    this.isLeaf = false;
  }

  setChecked(value, deep, recursion, passValue) {
    this.indeterminate = value === 'half';
    this.checked = value === true;

    /* checkStrictly 在显示复选框的情况下，是否严格的遵循父子不互相关联的做法，默认为 false */
    /* 父子不互相关联则直接退出 */
    if (this.store.checkStrictly) return;

    /* 父子关联则需要向下递归将存在关系的父子节点全部选中 */
    if (!(this.shouldLoadData() && !this.store.checkDescendants)) {
      let { all, allWithoutDisable } = getChildState(this.childNodes);

      if (!this.isLeaf && (!all && allWithoutDisable)) {
        this.checked = false;
        value = false;
      }

      const handleDescendants = () => {
        if (deep) {
          const childNodes = this.childNodes;
          for (let i = 0, j = childNodes.length; i < j; i++) {
            const child = childNodes[i];
            passValue = passValue || value !== false;
            const isCheck = child.disabled ? child.checked : passValue;
            child.setChecked(isCheck, deep, true, passValue);
          }
          const { half, all } = getChildState(childNodes);
          if (!all) {
            this.checked = all;
            this.indeterminate = half;
          }
        }
      };

      if (this.shouldLoadData()) {
        // Only work on lazy load data.
        this.loadData(() => {
          handleDescendants();
          reInitChecked(this);
        }, {
          checked: value !== false
        });
        return;
      } else {
        handleDescendants();
      }
    }

    const parent = this.parent;
    if (!parent || parent.level === 0) return;

    if (!recursion) {
      reInitChecked(parent);
    }
  }

  getChildren(forceInit = false) { // this is data
    if (this.level === 0) return this.data;
    const data = this.data;
    if (!data) return null;

    const props = this.store.props;
    let children = 'children';
    if (props) {
      children = props.children || 'children';
    }

    if (data[children] === undefined) {
      data[children] = null;
    }

    if (forceInit && !data[children]) {
      data[children] = [];
    }

    return data[children];
  }

  updateChildren() {
    const newData = this.getChildren() || [];
    const oldData = this.childNodes.map((node) => node.data);

    const newDataMap = {};
    const newNodes = [];

    newData.forEach((item, index) => {
      const key = item[NODE_KEY];
      const isNodeExists = !!key && arrayFindIndex(oldData, data => data[NODE_KEY] === key) >= 0;
      if (isNodeExists) {
        newDataMap[key] = { index, data: item };
      } else {
        newNodes.push({ index, data: item });
      }
    });

    if (!this.store.lazy) {
      oldData.forEach((item) => {
        if (!newDataMap[item[NODE_KEY]]) this.removeChildByData(item);
      });
    }

    newNodes.forEach(({ index, data }) => {
      this.insertChild({ data }, index);
    });

    this.updateLeafState();
  }

  loadData(callback, defaultProps = {}) {
    // 开启懒加载并且未加载并且当前不在加载中
    if (this.store.lazy === true && this.store.load && !this.loaded && (!this.loading || Object.keys(defaultProps).length)) {
      this.loading = true;

      // 给当前节点添加子节点
      const resolve = (children) => {
        this.childNodes = [];

        this.doCreateChildren(children, defaultProps);
        this.loaded = true;
        this.loading = false;
        this.updateLeafState();
        if (callback) {
          callback.call(this, children);
        }
      };

      // this.store.load就是用户传入的load方法
      this.store.load(this, resolve);
    } else {
      if (callback) {
        callback.call(this);
      }
    }
  }
}
