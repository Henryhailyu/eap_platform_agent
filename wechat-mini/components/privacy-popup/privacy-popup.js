Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onOpenContract() {
      if (wx.openPrivacyContract) {
        wx.openPrivacyContract();
      }
    },

    onAgree() {
      this.triggerEvent('agree');
    },

    onDecline() {
      this.triggerEvent('decline');
    },
  },
});
