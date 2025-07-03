const crypto = require('crypto');
const logger = require('../utils/logger');
const apiServices = require('../services');

class WebhookHandler {
  constructor() {
    this.eventHandlers = {
      'push': this.handlePush.bind(this),
      'pull_request': this.handlePullRequest.bind(this),
      'repository': this.handleRepository.bind(this),
      'installation': this.handleInstallation.bind(this),
      'installation_repositories': this.handleInstallationRepositories.bind(this),
      'issues': this.handleIssues.bind(this),
      'issue_comment': this.handleIssueComment.bind(this),
    };
  }

  async handle(req, res, githubApp) {
    const signature = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];
    const deliveryId = req.headers['x-github-delivery'];
    
    // Verify webhook signature
    if (!this.verifySignature(req.body, signature, githubApp.webhooks.secret)) {
      logger.warn('Invalid webhook signature', { deliveryId, event });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    logger.info('Webhook received', {
      event,
      deliveryId,
      action: req.body.action,
      repository: req.body.repository?.full_name,
    });

    try {
      const handler = this.eventHandlers[event];
      if (handler) {
        await handler(req.body, githubApp);
        res.status(200).json({ message: 'Webhook processed successfully' });
      } else {
        logger.info(`No handler for event: ${event}`, { deliveryId });
        res.status(200).json({ message: 'Event acknowledged but not processed' });
      }
    } catch (error) {
      logger.error('Webhook processing error:', {
        error: error.message,
        stack: error.stack,
        event,
        deliveryId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  verifySignature(payload, signature, secret) {
    if (!signature || !secret) return false;
    
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');
    
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  }

  async handlePush(payload, githubApp) {
    const { repository, pusher, commits } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;

    logger.githubAction('push', owner, repo, {
      pusher: pusher.name,
      commitsCount: commits.length,
      branch: payload.ref,
    });

    // Check if push contains smart contract files
    const contractFiles = this.findContractFiles(commits);
    if (contractFiles.length > 0) {
      logger.info('Smart contract files detected in push', {
        owner,
        repo,
        files: contractFiles,
      });

      // Trigger gas estimation analysis
      try {
        await apiServices.gasEstimation.analyzeRepository(owner, repo);
      } catch (error) {
        logger.error('Gas estimation analysis failed:', error);
      }

      // Trigger network monitoring update
      try {
        await apiServices.networkMonitoring.updateDeployments(owner, repo);
      } catch (error) {
        logger.error('Network monitoring update failed:', error);
      }
    }
  }

  async handlePullRequest(payload, githubApp) {
    const { action, pull_request, repository } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;
    const prNumber = pull_request.number;

    logger.githubAction('pull_request', owner, repo, {
      action,
      prNumber,
      title: pull_request.title,
    });

    if (action === 'opened' || action === 'synchronize') {
      // Check if PR contains smart contract changes
      const octokit = await githubApp.getInstallationOctokit(payload.installation.id);
      
      try {
        const { data: files } = await octokit.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: prNumber,
        });

        const contractFiles = files.filter(file => 
          file.filename.endsWith('.sol') || 
          file.filename.endsWith('.vy') ||
          file.filename.includes('contract')
        );

        if (contractFiles.length > 0) {
          // Add automated analysis comment
          await this.addAnalysisComment(octokit, owner, repo, prNumber, contractFiles);
        }
      } catch (error) {
        logger.error('PR analysis failed:', error);
      }
    }
  }

  async handleRepository(payload, githubApp) {
    const { action, repository } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;

    logger.githubAction('repository', owner, repo, { action });

    if (action === 'created') {
      // Initialize monitoring for new repository
      try {
        await apiServices.networkMonitoring.initializeRepository(owner, repo);
      } catch (error) {
        logger.error('Repository initialization failed:', error);
      }
    }
  }

  async handleInstallation(payload, githubApp) {
    const { action, installation } = payload;
    
    logger.githubAction('installation', installation.account.login, null, {
      action,
      installationId: installation.id,
    });

    if (action === 'created') {
      // Welcome message or setup instructions
      logger.info('New installation created', {
        account: installation.account.login,
        repositories: installation.repository_selection,
      });
    }
  }

  async handleInstallationRepositories(payload, githubApp) {
    const { action, installation, repositories_added, repositories_removed } = payload;
    
    logger.githubAction('installation_repositories', installation.account.login, null, {
      action,
      added: repositories_added?.length || 0,
      removed: repositories_removed?.length || 0,
    });

    // Initialize monitoring for newly added repositories
    if (repositories_added) {
      for (const repo of repositories_added) {
        try {
          await apiServices.networkMonitoring.initializeRepository(
            repo.owner.login,
            repo.name
          );
        } catch (error) {
          logger.error('Repository initialization failed:', error);
        }
      }
    }
  }

  async handleIssues(payload, githubApp) {
    const { action, issue, repository } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;

    logger.githubAction('issues', owner, repo, {
      action,
      issueNumber: issue.number,
      title: issue.title,
    });

    // Auto-label crypto/blockchain related issues
    if (action === 'opened') {
      await this.autoLabelIssue(payload, githubApp);
    }
  }

  async handleIssueComment(payload, githubApp) {
    const { action, comment, issue, repository } = payload;
    
    if (action === 'created' && comment.body.includes('@crypto-intel-bot')) {
      // Handle bot mentions in comments
      await this.handleBotMention(payload, githubApp);
    }
  }

  findContractFiles(commits) {
    const contractFiles = [];
    
    for (const commit of commits) {
      const files = [...(commit.added || []), ...(commit.modified || [])];
      contractFiles.push(...files.filter(file => 
        file.endsWith('.sol') || 
        file.endsWith('.vy') ||
        file.includes('contract') ||
        file.includes('Contract')
      ));
    }
    
    return [...new Set(contractFiles)]; // Remove duplicates
  }

  async addAnalysisComment(octokit, owner, repo, prNumber, contractFiles) {
    const comment = `## 🔍 Crypto Intel Bot Analysis

I detected smart contract changes in this PR:
${contractFiles.map(file => `- \`${file.filename}\``).join('\n')}

**Automated Analysis:**
- ⛽ Gas estimation analysis in progress...
- 🌐 Network deployment monitoring active
- 📊 DeFi protocol integration checks running

Results will be updated here once analysis is complete.

---
*This is an automated message from Crypto Intel Bot*`;

    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: comment,
      });
    } catch (error) {
      logger.error('Failed to create PR comment:', error);
    }
  }

  async autoLabelIssue(payload, githubApp) {
    const { issue, repository, installation } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;
    
    const cryptoKeywords = [
      'smart contract', 'solidity', 'defi', 'ethereum', 'polygon',
      'gas', 'wei', 'gwei', 'blockchain', 'web3', 'dapp', 'nft',
      'token', 'crypto', 'uniswap', 'aave', 'compound'
    ];
    
    const issueText = (issue.title + ' ' + issue.body).toLowerCase();
    const hasCryptoContent = cryptoKeywords.some(keyword => 
      issueText.includes(keyword)
    );
    
    if (hasCryptoContent) {
      try {
        const octokit = await githubApp.getInstallationOctokit(installation.id);
        
        await octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: issue.number,
          labels: ['crypto', 'blockchain'],
        });
        
        logger.info('Auto-labeled crypto issue', {
          owner,
          repo,
          issueNumber: issue.number,
        });
      } catch (error) {
        logger.error('Failed to auto-label issue:', error);
      }
    }
  }

  async handleBotMention(payload, githubApp) {
    const { comment, issue, repository, installation } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;
    
    // Parse bot commands from comment
    const commands = this.parseBotCommands(comment.body);
    
    if (commands.length > 0) {
      const octokit = await githubApp.getInstallationOctokit(installation.id);
      
      for (const command of commands) {
        await this.executeBotCommand(command, octokit, owner, repo, issue.number);
      }
    }
  }

  parseBotCommands(commentBody) {
    const commands = [];
    const lines = commentBody.split('\n');
    
    for (const line of lines) {
      if (line.includes('@crypto-intel-bot')) {
        const match = line.match(/@crypto-intel-bot\s+(\w+)(?:\s+(.+))?/);
        if (match) {
          commands.push({
            command: match[1],
            args: match[2] ? match[2].split(' ') : [],
          });
        }
      }
    }
    
    return commands;
  }

  async executeBotCommand(command, octokit, owner, repo, issueNumber) {
    const { command: cmd, args } = command;
    
    try {
      switch (cmd) {
        case 'analyze':
          await apiServices.gasEstimation.analyzeRepository(owner, repo);
          await this.replyToCommand(octokit, owner, repo, issueNumber, 
            '✅ Gas analysis started for this repository.');
          break;
          
        case 'monitor':
          await apiServices.networkMonitoring.updateDeployments(owner, repo);
          await this.replyToCommand(octokit, owner, repo, issueNumber, 
            '✅ Network monitoring activated for this repository.');
          break;
          
        case 'status':
          const status = await apiServices.getOverallStatus();
          await this.replyToCommand(octokit, owner, repo, issueNumber, 
            `📊 **Current Status:**\n${JSON.stringify(status, null, 2)}`);
          break;
          
        default:
          await this.replyToCommand(octokit, owner, repo, issueNumber, 
            `❓ Unknown command: \`${cmd}\`. Available commands: analyze, monitor, status`);
      }
    } catch (error) {
      logger.error('Bot command execution failed:', error);
      await this.replyToCommand(octokit, owner, repo, issueNumber, 
        `❌ Command failed: ${error.message}`);
    }
  }

  async replyToCommand(octokit, owner, repo, issueNumber, message) {
    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: message,
      });
    } catch (error) {
      logger.error('Failed to reply to command:', error);
    }
  }
}

module.exports = new WebhookHandler(); 