function broadcast(componentName, eventName, params) {
  // 递归向下查找name为componentName的子组件；找到则 目标实例 $emit 事件
  this.$children.forEach(child => {
    var name = child.$options.componentName;

    if (name === componentName) {
      child.$emit.apply(child, [eventName].concat(params));
    } else {
      broadcast.apply(child, [componentName, eventName].concat([params]));
    }
  });
}
export default {
  methods: {
    dispatch(componentName, eventName, params) {
      var parent = this.$parent || this.$root;
      var name = parent.$options.componentName;

      // 查找name为componentName的父组件；若找到，parent值为目标组件实例，若遍历到root都未找到、则parent值为undefined （细节，element-ui的组件 option都会添加name）
      while (parent && (!name || name !== componentName)) {
        parent = parent.$parent;

        if (parent) {
          name = parent.$options.componentName;
        }
      }
      // parent存在，也就是找到了; 目标实例 $emit 事件
      if (parent) {
        parent.$emit.apply(parent, [eventName].concat(params));
      }
    },
    broadcast(componentName, eventName, params) {
      broadcast.call(this, componentName, eventName, params);
    }
  }
};
