<template>
  <div
    class="el-tree-node"
    @click.stop="handleClick"
    @contextmenu="($event) => this.handleContextMenu($event)"
    v-show="node.visible"
    :class="{
      'is-expanded': expanded,
      'is-current': node.isCurrent,
      'is-hidden': !node.visible,
      'is-focusable': !node.disabled,
      'is-checked': !node.disabled && node.checked
    }"
    role="treeitem"
    tabindex="-1"
    :aria-expanded="expanded"
    :aria-disabled="node.disabled"
    :aria-checked="node.checked"
    :draggable="tree.draggable"
    @dragstart.stop="handleDragStart"
    @dragover.stop="handleDragOver"
    @dragend.stop="handleDragEnd"
    @drop.stop="handleDrop"
    ref="node"
  >
  <!-- padding-left：节点偏移量 -->
    <div class="el-tree-node__content"
      :style="{ 'padding-left': (node.level - 1) * tree.indent + 'px' }">
      <!-- 展开图标点击事件 -->
      <!-- 展开图标：点击后切换节点的点击状态 -->
      <span
        @click.stop="handleExpandIconClick"
        :class="[
          { 'is-leaf': node.isLeaf, expanded: !node.isLeaf && expanded },
          'el-tree-node__expand-icon',
          tree.iconClass ? tree.iconClass : 'el-icon-caret-right'
        ]"
      >
      </span>
      <!-- 复选框：点击后切换节点的选择状态 -->
      <el-checkbox
        v-if="showCheckbox"
        v-model="node.checked"
        :indeterminate="node.indeterminate"
        :disabled="!!node.disabled"
        @click.native.stop
        @change="handleCheckChange"
      >
      </el-checkbox>
      <!-- loading 这里直接使用了loading图标 -->
      <span
        v-if="node.loading"
        class="el-tree-node__loading-icon el-icon-loading">
      </span>
      <node-content :node="node"></node-content>
    </div>
    <!-- 折叠器 https://element.eleme.io/#/zh-CN/component/transition -->
    <el-collapse-transition>
      <!-- 节点的点击状态为expanded时展示子节点 -->
      <div
        class="el-tree-node__children"
        v-if="!renderAfterExpand || childNodeRendered"
        v-show="expanded"
        role="group"
        :aria-expanded="expanded"
      >
        <el-tree-node
          :render-content="renderContent"
          v-for="child in node.childNodes"
          :render-after-expand="renderAfterExpand"
          :show-checkbox="showCheckbox"
          :key="getNodeKey(child)"
          :node="child"
          @node-expand="handleChildNodeExpand">
        </el-tree-node>
      </div>
    </el-collapse-transition>
  </div>
</template>

<script type="text/jsx">
  import ElCollapseTransition from 'element-ui/src/transitions/collapse-transition';
  import ElCheckbox from 'element-ui/packages/checkbox';
  import emitter from 'element-ui/src/mixins/emitter';
  import { getNodeKey } from './model/util';

  export default {
    name: 'ElTreeNode',

    componentName: 'ElTreeNode',

    mixins: [emitter],

    props: {
      node: {
        default() {
          return {};
        }
      },
      props: {},
      renderContent: Function,
      renderAfterExpand: {
        type: Boolean,
        default: true
      },
      showCheckbox: {
        type: Boolean,
        default: false
      }
    },

    components: {
      ElCollapseTransition,
      ElCheckbox,
      // 处理插槽逻辑
      NodeContent: {
        props: {
          node: {
            required: true
          }
        },
        render(h) {
          const parent = this.$parent;
          const tree = parent.tree;
          const node = this.node;
          const { data, store } = node;
          return (
            parent.renderContent
              ? parent.renderContent.call(parent._renderProxy, h, { _self: tree.$vnode.context, node, data, store })
              : tree.$scopedSlots.default
                ? tree.$scopedSlots.default({ node, data })
                : <span class="el-tree-node__label">{ node.label }</span>
          );
        }
      }
    },

    data() {
      return {
        tree: null,
        expanded: false,
        childNodeRendered: false,
        oldChecked: null,
        oldIndeterminate: null
      };
    },

    watch: {
      'node.indeterminate'(val) {
        this.handleSelectChange(this.node.checked, val);
      },

      'node.checked'(val) {
        this.handleSelectChange(val, this.node.indeterminate);
      },
      /* 点击后expanded为true */
      'node.expanded'(val) {
        this.$nextTick(() => this.expanded = val);
        if (val) {
          this.childNodeRendered = true;
        }
      }
    },

    methods: {
      getNodeKey(node) {
        return getNodeKey(this.tree.nodeKey, node.data);
      },

      handleSelectChange(checked, indeterminate) {
        if (this.oldChecked !== checked && this.oldIndeterminate !== indeterminate) {
          this.tree.$emit('check-change', this.node.data, checked, indeterminate);
        }
        this.oldChecked = checked;
        this.indeterminate = indeterminate;
      },

      // 开启expandOnClickNode 则：是否在点击节点的时候展开或者收缩节点， 默认值为 true，如果为 false，则只有点箭头图标的时候才会展开或者收缩节点。
      handleClick() {
        const store = this.tree.store;
        store.setCurrentNode(this.node);
        this.tree.$emit('current-change', store.currentNode ? store.currentNode.data : null, store.currentNode);
        this.tree.currentNode = this;
        if (this.tree.expandOnClickNode) {
          this.handleExpandIconClick();
        }
        if (this.tree.checkOnClickNode && !this.node.disabled) {
          this.handleCheckChange(null, {
            target: { checked: !this.node.checked }
          });
        }
        this.tree.$emit('node-click', this.node.data, this.node, this);
      },

      handleContextMenu(event) {
        if (this.tree._events['node-contextmenu'] && this.tree._events['node-contextmenu'].length > 0) {
          event.stopPropagation();
          event.preventDefault();
        }
        this.tree.$emit('node-contextmenu', event, this.node.data, this.node, this);
      },

      handleExpandIconClick() {
        /* 叶子节点直接退出 */
        if (this.node.isLeaf) return;
        /* 已经展开则关闭 */
        if (this.expanded) {
          // 抛出节点关闭事件
          this.tree.$emit('node-collapse', this.node.data, this.node, this);
          this.node.collapse();
        } else {
          /* 展开 */
          this.node.expand(); // node.expand
          // 抛出节点展开事件
          this.$emit('node-expand', this.node.data, this.node, this);
        }
      },

      handleCheckChange(value, ev) {
        this.node.setChecked(ev.target.checked, !this.tree.checkStrictly);
        this.$nextTick(() => {
          const store = this.tree.store;
          this.tree.$emit('check', this.node.data, {
            checkedNodes: store.getCheckedNodes(),
            checkedKeys: store.getCheckedKeys(),
            halfCheckedNodes: store.getHalfCheckedNodes(),
            halfCheckedKeys: store.getHalfCheckedKeys(),
          });
        });
      },

      handleChildNodeExpand(nodeData, node, instance) {
        this.broadcast('ElTreeNode', 'tree-node-expand', node);
        this.tree.$emit('node-expand', nodeData, node, instance);
      },

      handleDragStart(event) {
        if (!this.tree.draggable) return;
        this.tree.$emit('tree-node-drag-start', event, this);
      },

      handleDragOver(event) {
        if (!this.tree.draggable) return;
        this.tree.$emit('tree-node-drag-over', event, this);
        event.preventDefault();
      },

      handleDrop(event) {
        event.preventDefault();
      },

      handleDragEnd(event) {
        if (!this.tree.draggable) return;
        this.tree.$emit('tree-node-drag-end', event, this);
      }
    },

    created() {
      const parent = this.$parent;

      /* 初始化tree保存根节点数据 */
      if (parent.isTree) {
        this.tree = parent;
      } else {
        this.tree = parent.tree;
      }

      const tree = this.tree;
      if (!tree) {
        console.warn('Can not find node\'s tree.');
      }

      const props = tree.props || {};
      const childrenKey = props['children'] || 'children';

      this.$watch(`node.data.${childrenKey}`, () => {
        this.node.updateChildren();
      });

      if (this.node.expanded) {
        this.expanded = true;
        this.childNodeRendered = true;
      }

      if(this.tree.accordion) {
        this.$on('tree-node-expand', node => {
          if(this.node !== node) {
            this.node.collapse();
          }
        });
      }
    }
  };
</script>
