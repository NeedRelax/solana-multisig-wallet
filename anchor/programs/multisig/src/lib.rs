#![allow(clippy::result_large_err)] // 允许 Clippy 忽略大型错误类型的警告，优化编译

use anchor_lang::prelude::*; // 导入 Anchor 框架的核心模块，包括账户、上下文等功能
use anchor_lang::solana_program::instruction::Instruction; // 导入 Solana 指令结构体，用于构建链上指令
use anchor_lang::solana_program::program::invoke_signed; // 导入 invoke_signed 函数，用于 PDA 签名调用指令
use std::convert::TryInto; // 导入 TryInto trait，用于类型转换

declare_id!("3iowdFMjwgiGVPyQDRQyMzVzdF7qiMGK1rd85zzDj4HK"); // 声明程序的唯一标识 ID，部署时固定

/// 多签钱包程序模块，包含所有指令逻辑
#[program]
pub mod multisig {
    use super::*; // 导入父模块的符号，方便访问外部定义

    /// 初始化多签钱包
    /// - `owners`: 多签所有者公钥列表
    /// - `threshold`: 执行交易所需的最小签名数
    /// - `nonce`: PDA 签名用的随机数
    pub fn initialize(
        ctx: Context<Initialize>, // 指令上下文，包含相关账户信息
        owners: Vec<Pubkey>,      // 所有者公钥数组
        threshold: u64,           // 签名阈值
        nonce: u8,                // PDA 签名用 nonce
    ) -> Result<()> {
        // 返回 Result，成功为 Ok，失败为错误
        let multisig = &mut ctx.accounts.multisig; // 获取可变的多签账户引用
        require_gte!(owners.len() as u64, 1, MultisigError::InvalidOwners); // 验证 owners 列表非空
        require_gte!(threshold, 1, MultisigError::InvalidThreshold); // 验证 threshold 大于 0
        require!(
            threshold <= owners.len() as u64,
            MultisigError::InvalidThreshold
        ); // 验证 threshold 不大于所有者数
        require!(owners.len() <= 10, MultisigError::TooManyOwners); // 限制 owners 最大为 10，防止空间溢出

        multisig.owners = owners; // 设置多签账户的所有者列表
        multisig.threshold = threshold; // 设置多签账户的签名阈值
        multisig.nonce = nonce; // 设置多签账户的 PDA 签名 nonce
        multisig.owners_version = 0; // 初始化所有者版本号为 0
        Ok(()) // 返回成功
    }

    /// 创建交易提案
    /// - `pid`: 目标程序 ID
    /// - `accs`: 交易涉及的账户列表
    /// - `data`: 交易指令数据
    pub fn create_transaction(
        ctx: Context<CreateTransaction>, // 指令上下文，包含相关账户
        pid: Pubkey,                     // 目标程序的公钥
        accs: Vec<TransactionAccount>,   // 交易涉及的账户元数据列表
        data: Vec<u8>,                   // 交易的指令数据
    ) -> Result<()> {
        // 返回 Result，成功为 Ok，失败为错误
        let multisig = &ctx.accounts.multisig; // 获取只读的多签账户引用
        let proposer = &ctx.accounts.proposer; // 获取提议者账户引用
        let owner_index = multisig // 查找提议者在所有者列表中的索引
            .owners
            .iter()
            .position(|a| a == proposer.key)
            .ok_or(MultisigError::InvalidOwner)?; // 未找到则返回 InvalidOwner 错误
        require!(accs.len() <= 20, MultisigError::TooManyAccounts); // 限制账户列表最大为 20，防止溢出

        let tx = &mut ctx.accounts.transaction; // 获取可变的交易账户引用
        let mut signers = vec![false; multisig.owners.len()]; // 初始化签名状态数组，长度等于所有者数
        signers[owner_index] = true; // 标记提议者已签名

        tx.program_id = pid; // 设置交易的目标程序 ID
        tx.accounts = accs; // 设置交易的账户列表
        tx.data = data; // 设置交易的指令数据
        tx.signers = signers; // 设置签名状态数组
        tx.multisig = multisig.key(); // 设置关联的多签账户公钥
        tx.executed_at = 0; // 初始化执行时间为 0，表示未执行
        tx.owners_version = multisig.owners_version; // 记录当前所有者版本号
        Ok(()) // 返回成功
    }

    /// 批准交易
    pub fn approve(ctx: Context<Approve>) -> Result<()> {
        // 返回 Result，成功为 Ok，失败为错误
        let multisig = &ctx.accounts.multisig; // 获取只读的多签账户引用
        let tx = &mut ctx.accounts.transaction; // 获取可变的交易账户引用

        require_eq!(
            // 验证交易创建时的所有者版本与当前一致
            tx.owners_version,
            multisig.owners_version,
            MultisigError::OwnerSetChanged
        );

        let owner = &ctx.accounts.owner; // 获取批准者账户引用
        let owner_index = multisig // 查找批准者在所有者列表中的索引
            .owners
            .iter()
            .position(|a| a == owner.key)
            .ok_or(MultisigError::InvalidOwner)?; // 未找到则返回 InvalidOwner 错误

        tx.signers[owner_index] = true; // 标记批准者已签名
        Ok(()) // 返回成功
    }

    /// 执行交易
    pub fn execute_transaction(ctx: Context<ExecuteTransaction>) -> Result<()> {
        // 返回 Result，成功为 Ok，失败为错误
        let multisig = &ctx.accounts.multisig; // 获取只读的多签账户引用
        let tx = &mut ctx.accounts.transaction; // 获取可变的交易账户引用

        require_eq!(tx.executed_at, 0, MultisigError::AlreadyExecuted); // 验证交易未被执行
        require!(
            // 验证已签名的所有者数量达到阈值
            tx.signers.iter().filter(|&s| *s).count() as u64 >= multisig.threshold,
            MultisigError::NotEnoughSignatures
        );
        require_eq!(
            // 验证传入的 remaining_accounts 数量与交易账户一致
            ctx.remaining_accounts.len(),
            tx.accounts.len(),
            MultisigError::InvalidAccounts
        );
        let instruction = tx.to_instruction(&ctx.accounts.multisig_signer.key()); // 将交易转换为 Solana 指令
        let nonce_slice: &[u8] = std::slice::from_ref(&multisig.nonce); // 将 nonce 转为 &[u8]
        let multisig_key = &multisig.key(); // 获取多签账户的公钥
        let seeds = &[&multisig_key.as_ref(), nonce_slice]; // 定义 PDA 签名的种子
        let signer = &[&seeds[..]]; // 创建签名者种子数组

        invoke_signed(&instruction, &ctx.remaining_accounts, signer)?; // 使用 PDA 签名执行指令

        tx.executed_at = Clock::get()?.unix_timestamp; // 记录交易执行的 Unix 时间戳
        Ok(()) // 返回成功
    }
}

/// 多签钱包账户的数据结构
#[account]
pub struct Multisig {
    pub owners: Vec<Pubkey>, // 存储所有者公钥的动态数组
    pub threshold: u64,      // 执行交易所需的最小签名数
    pub nonce: u8,           // PDA 签名用的随机数
    pub owners_version: u32, // 所有者列表的版本号，防止修改冲突
}

/// 交易提案账户的数据结构
#[account]
pub struct Transaction {
    pub multisig: Pubkey,                  // 关联的多签账户公钥
    pub program_id: Pubkey,                // 目标程序的公钥
    pub accounts: Vec<TransactionAccount>, // 交易涉及的账户元数据列表
    pub data: Vec<u8>,                     // 交易的指令数据
    pub signers: Vec<bool>,                // 记录每个所有者签名状态的数组
    pub executed_at: i64,                  // 交易执行时间（0 表示未执行）
    pub owners_version: u32,               // 创建交易时的所有者版本号
}

/// 交易账户的元数据结构
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TransactionAccount {
    pub pubkey: Pubkey,    // 账户的公钥
    pub is_signer: bool,   // 是否为签名者
    pub is_writable: bool, // 是否为可写账户
}

/// 初始化多签钱包的账户约束
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init, // 初始化新账户
        payer = payer, // 由 payer 支付创建费用
        space = Multisig::space(10), // 分配空间，假设最多 10 个 owners
    )]
    pub multisig: Account<'info, Multisig>, // 多签账户

    #[account(mut)] // 标记为可写
    pub payer: Signer<'info>, // 支付创建费用的签名者

    pub system_program: Program<'info, System>, // 系统程序，用于账户创建
}

/// 创建交易提案的账户约束
#[derive(Accounts)]
pub struct CreateTransaction<'info> {
    #[account()] // 只读的多签账户
    pub multisig: Account<'info, Multisig>, // 多签账户

    #[account(
        init, // 初始化新交易账户
        payer = proposer, // 由提议者支付创建费用
        space = Transaction::space(20, 256), // 分配空间，假设最多 20 个账户和 256 字节数据
    )]
    pub transaction: Account<'info, Transaction>, // 交易账户

    #[account(mut)] // 标记为可写
    pub proposer: Signer<'info>, // 提议交易的签名者

    pub system_program: Program<'info, System>, // 系统程序，用于账户创建
}

/// 批准交易的账户约束
#[derive(Accounts)]
pub struct Approve<'info> {
    #[account()] // 只读的多签账户
    pub multisig: Account<'info, Multisig>, // 多签账户

    #[account(
        mut, // 标记为可写
        constraint = transaction.multisig == multisig.key() @ MultisigError::InvalidMultisig // 验证交易关联的多签账户
    )]
    pub transaction: Account<'info, Transaction>, // 交易账户

    #[account()] // 只读的批准者账户
    pub owner: Signer<'info>, // 批准交易的签名者
}

/// 执行交易的账户约束
#[derive(Accounts)]
pub struct ExecuteTransaction<'info> {
    #[account()] // 只读的多签账户
    pub multisig: Account<'info, Multisig>, // 多签账户

    /// CHECK: PDA 签名者，由种子和 nonce 验证
    #[account(seeds = [multisig.key().as_ref()], bump = multisig.nonce)] // 验证 PDA 种子
    pub multisig_signer: AccountInfo<'info>, // PDA 签名者账户

    #[account(
        mut, // 标记为可写
        has_one = multisig @ MultisigError::InvalidMultisig // 验证交易关联的多签账户
    )]
    pub transaction: Account<'info, Transaction>, // 交易账户
}

impl Multisig {
    /// 计算多签账户的存储空间
    pub fn space(max_owners: usize) -> usize {
        // 输入最大所有者数
        8 + // 账户 discriminator（Anchor 自动添加）
        4 + 32 * max_owners + // owners 向量（4 字节长度 + 每个 Pubkey 32 字节）
        8 + // threshold（u64）
        1 + // nonce（u8）
        4 // owners_version（u32）
    }
}

impl Transaction {
    /// 计算交易账户的存储空间
    pub fn space(max_accounts: usize, max_data: usize) -> usize {
        // 输入最大账户数和数据长度
        8 + // 账户 discriminator（Anchor 自动添加）
        32 + // multisig Pubkey
        32 + // program_id Pubkey
        4 + max_accounts * (32 + 1 + 1) + // accounts 向量（4 字节长度 + 每个 TransactionAccount 34 字节）
        4 + max_data + // data 向量（4 字节长度 + 数据字节）
        4 + max_accounts + // signers 向量（4 字节长度 + 每个 bool 1 字节）
        8 + // executed_at（i64）
        4 // owners_version（u32）
    }

    /// 将交易转换为 Solana 指令
    pub fn to_instruction(&self, multisig_signer: &Pubkey) -> Instruction {
        // 输入 PDA 签名者公钥
        Instruction {
            // 创建新的 Solana 指令
            program_id: self.program_id, // 设置目标程序 ID
            accounts: self
                .accounts
                .iter()
                .map(|acc| {
                    // 转换账户元数据为 AccountMeta
                    if acc.pubkey == *multisig_signer {
                        // 如果账户是 PDA 签名者
                        AccountMeta::new(acc.pubkey, true) // 标记为签名者
                    } else {
                        // 其他账户
                        AccountMeta {
                            // 按原元数据设置
                            pubkey: acc.pubkey,
                            is_signer: acc.is_signer,
                            is_writable: acc.is_writable,
                        }
                    }
                })
                .collect(), // 收集为向量
            data: self.data.clone(),     // 复制指令数据
        }
    }
}

impl From<&Transaction> for Instruction {
    fn from(tx: &Transaction) -> Instruction {
        // 将交易引用转换为指令
        tx.to_instruction(&tx.multisig) // 使用交易的 multisig 公钥作为签名者
    }
}

impl From<Transaction> for Instruction {
    fn from(tx: Transaction) -> Instruction {
        // 将交易所有权转换为指令
        Instruction::from(&tx) // 调用引用版本的转换
    }
}

/// 自定义错误类型
#[error_code]
pub enum MultisigError {
    #[msg("The given owner is not part of this multisig.")] // 所有者不在多签列表中
    InvalidOwner,
    #[msg("Threshold must be > 0 and <= total owners.")] // 阈值无效
    InvalidThreshold,
    #[msg("Owners list cannot be empty.")] // 所有者列表为空
    InvalidOwners,
    #[msg("Transaction has already been executed.")] // 交易已被执行
    AlreadyExecuted,
    #[msg("Not enough signers to execute transaction.")] // 签名数量不足
    NotEnoughSignatures,
    #[msg("The owner set has changed since the transaction was created.")] // 所有者列表已更改
    OwnerSetChanged,
    #[msg("Too many owners provided.")] // 所有者数量过多
    TooManyOwners,
    #[msg("Too many accounts in transaction.")] // 交易账户数量过多
    TooManyAccounts,
    #[msg("Invalid multisig account.")] // 无效的多签账户
    InvalidMultisig,
    #[msg("Invalid accounts provided for execution.")] // 执行时账户无效
    InvalidAccounts,
}
