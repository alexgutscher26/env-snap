module.exports = {
  commands: [
    {
      name: 'hello',
      description: 'Say hello from the example plugin',
      action: async (args) => {
        console.log('Hello from the example plugin!');
        if (args && args.length > 0) {
          console.log('Arguments:', args);
        }
      }
    }
  ],
  hooks: [
    {
      name: 'post-snapshot',
      action: async (context) => {
        console.log('[Example Plugin] Snapshot created:', context.snapshotId);
      }
    }
  ]
};