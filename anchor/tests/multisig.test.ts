// 导入 Anchor 框架的所有功能，用于 Solana 程序开发
import * as anchor from '@coral-xyz/anchor';

// 导入 Anchor 的核心类：Program 用于程序交互，AnchorProvider 用于环境配置，BN 用于大整数处理
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';

// 导入 Solana 的核心类：Keypair 用于生成密钥对，PublicKey 用于公钥，SystemProgram 用于系统指令，LAMPORTS_PER_SOL 用于 SOL 单位转换，Connection 用于链上连接
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Connection,
} from '@solana/web3.js';

// 导入编译生成的 Multisig 程序类型定义
import { Multisig } from '../target/types/multisig';

// 定义一个可靠的空投辅助函数，确保空投交易被确认
async function airdrop(connection: Connection, publicKey: PublicKey, lamports: number = LAMPORTS_PER_SOL) {
    // 请求向指定公钥空投指定数量的 lamports（默认为 1 SOL）
    const signature = await connection.requestAirdrop(publicKey, lamports);
    // 获取最新的区块哈希，用于确认交易
    const latestBlockhash = await connection.getLatestBlockhash();
    // 等待交易确认
    await connection.confirmTransaction({
        blockhash: latestBlockhash.blockhash, // 当前区块哈希
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight, // 区块有效高度
        signature: signature, // 空投交易的签名
    });
}

// 定义测试套件，名为 "multisig"
describe('multisig', () => {
  // 获取当前环境下的 Anchor 提供者（包含连接和钱包）
  const provider = AnchorProvider.env();
  // 设置 Anchor 的提供者为当前环境
  anchor.setProvider(provider);
  // 从工作空间加载编译好的 Multisig 程序
  const program = anchor.workspace.Multisig as Program<Multisig>;

  // --- 定义共享状态的变量 ---
  // 声明多签钱包的 Keypair
  let multisig: Keypair;
  // 声明多签的 PDA（程序派生地址）公钥
  let multisigSigner: PublicKey;
  // 声明 PDA 的 nonce 值
  let nonce: number;
  // 声明交易账户的 Keypair
  let transaction: Keypair;
  // 生成接收者的公钥
  const recipient = Keypair.generate().publicKey;
  // 设置转账金额为 0.1 SOL
  const transferAmount = new BN(0.1 * LAMPORTS_PER_SOL);

  // 生成三个所有者的 Keypair
  const ownerA = Keypair.generate();
  const ownerB = Keypair.generate();
  const ownerC = Keypair.generate();
  // 创建所有者公钥数组
  const owners = [ownerA.publicKey, ownerB.publicKey, ownerC.publicKey];
  // 设置多签阈值为 2（需要至少 2 个签名）
  const threshold = new BN(2);

  // 在所有测试开始前，仅执行一次空投，确保所有账户有资金
  beforeAll(async () => {
    // 并行为空投 ownerA、ownerB、ownerC 和测试钱包
    await Promise.all([
      airdrop(provider.connection, ownerA.publicKey), // 给 ownerA 空投
      airdrop(provider.connection, ownerB.publicKey), // 给 ownerB 空投
      airdrop(provider.connection, ownerC.publicKey), // 给 ownerC 空投
      airdrop(provider.connection, provider.wallet.publicKey), // 给测试钱包空投
    ]);
  });
  
  // --- 主流程测试 ---

  // 测试用例：初始化新的多签钱包
  it('Initializes a new multisig wallet', async () => {
    // 生成多签钱包的 Keypair
    multisig = Keypair.generate();

    // 计算多签的 PDA 地址和 nonce
    const [_multisigSigner, _nonce] = PublicKey.findProgramAddressSync(
      [multisig.publicKey.toBuffer()], // 使用多签公钥作为种子
      program.programId // 程序 ID
    );
    // 存储 PDA 公钥
    multisigSigner = _multisigSigner;
    // 存储 nonce 值
    nonce = _nonce;

    // 给多签 PDA 账户空投 2 SOL
    await airdrop(provider.connection, multisigSigner, 2 * LAMPORTS_PER_SOL);

    // 调用程序的 initialize 方法，初始化多签钱包
    await program.methods
      .initialize(owners, threshold, nonce) // 传入所有者公钥、阈值和 nonce
      .accounts({
        multisig: multisig.publicKey, // 多签账户
        payer: provider.wallet.publicKey, // 支付初始化费用的账户
      })
      .signers([multisig]) // 多签账户需要签名
      .rpc(); // 发送交易

    // 获取多签账户的状态
    const multisigAccount = await program.account.multisig.fetch(multisig.publicKey);
    // 验证所有者公钥列表
    expect(multisigAccount.owners).toEqual(owners);
    // 验证阈值
    expect(multisigAccount.threshold.toNumber()).toBe(threshold.toNumber());
  });

  // 测试用例：ownerA 创建转账交易提案
  it('Owner A creates a transfer transaction proposal', async () => {
    // 生成交易账户的 Keypair
    transaction = Keypair.generate();
    // 获取 SystemProgram 的程序 ID
    const pid = SystemProgram.programId;
    // 构建转账指令数据
    const data = Buffer.alloc(12); // 分配 12 字节缓冲区
    data.writeUInt32LE(2, 0); // 写入转账指令索引 (2 表示 SystemProgram 的 transfer)
    new BN(transferAmount).toArrayLike(Buffer, 'le', 8).copy(data, 4); // 写入转账金额（小端序）
    
    // 定义转账指令的账户列表
    const accs = [
      { pubkey: multisigSigner, isSigner: false, isWritable: true }, // 多签 PDA 作为付款账户
      { pubkey: recipient, isSigner: false, isWritable: true }, // 接收者账户
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // SystemProgram
    ];

    // 调用程序的 createTransaction 方法，创建交易提案
    await program.methods
      .createTransaction(pid, accs, data) // 传入程序 ID、账户列表和数据
      .accounts({
        multisig: multisig.publicKey, // 多签账户
        transaction: transaction.publicKey, // 交易账户
        proposer: ownerA.publicKey, // 提案者为 ownerA
      })
      .signers([ownerA, transaction]) // ownerA 和交易账户需要签名
      .rpc(); // 发送交易

    // 获取交易账户的状态
    const txAccount = await program.account.transaction.fetch(transaction.publicKey);
    // 验证交易账户的多签公钥
    expect(txAccount.multisig).toEqual(multisig.publicKey);
    // 验证提案者已签名
    expect(txAccount.signers[0]).toBe(true);
  });
  
  // 测试用例：未达到阈值时执行交易应失败
  it('Fails to execute before reaching the threshold', async () => {
    // 验证未达到阈值时执行交易会抛出错误
    await expect(
      program.methods
        .executeTransaction()
        .accounts({
          multisig: multisig.publicKey, // 多签账户
          multisigSigner, // 多签 PDA
          transaction: transaction.publicKey, // 交易账户
        })
        .remainingAccounts([
          { pubkey: multisigSigner, isSigner: false, isWritable: true }, // 多签 PDA
          { pubkey: recipient, isSigner: false, isWritable: true }, // 接收者
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // SystemProgram
        ])
        .rpc() // 发送交易
    ).rejects.toThrow(/NotEnoughSignatures/); // 期望抛出 NotEnoughSignatures 错误
  });
  
  // 测试用例：允许所有者多次批准交易（幂等性）
  it('Allows an owner to approve multiple times idempotently', async () => {
    // ownerA 批准交易
    await program.methods
      .approve()
      .accounts({
        multisig: multisig.publicKey, // 多签账户
        transaction: transaction.publicKey, // 交易账户
        owner: ownerA.publicKey, // 批准者为 ownerA
      })
      .signers([ownerA]) // ownerA 签名
      .rpc(); // 发送交易

    // 获取交易账户状态
    const txAccount = await program.account.transaction.fetch(transaction.publicKey);
    // 验证 ownerA 已签名
    expect(txAccount.signers[0]).toBe(true);
    // 验证 ownerB 未签名
    expect(txAccount.signers[1]).toBe(false);
  });

  // 测试用例：ownerB 批准交易
  it('Owner B approves the transaction', async () => {
    // ownerB 批准交易
    await program.methods
      .approve()
      .accounts({
        multisig: multisig.publicKey, // 多签账户
        transaction: transaction.publicKey, // 交易账户
        owner: ownerB.publicKey, // 批准者为 ownerB
      })
      .signers([ownerB]) // ownerB 签名
      .rpc(); // 发送交易

    // 获取交易账户状态
    const txAccount = await program.account.transaction.fetch(transaction.publicKey);
    // 验证 ownerB 已签名
    expect(txAccount.signers[1]).toBe(true);
  });

  // 测试用例：达到阈值后成功执行交易
  it('Executes the transaction successfully after reaching the threshold', async () => {
    // 获取接收者账户执行前的余额
    const balanceBefore = await provider.connection.getBalance(recipient);

    // 执行交易
    await program.methods
      .executeTransaction()
      .accounts({
        multisig: multisig.publicKey, // 多签账户
        multisigSigner, // 多签 PDA
        transaction: transaction.publicKey, // 交易账户
      })
      .remainingAccounts([
        { pubkey: multisigSigner, isSigner: false, isWritable: true }, // 多签 PDA
        { pubkey: recipient, isSigner: false, isWritable: true }, // 接收者
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // SystemProgram
      ])
      .rpc(); // 发送交易

    // 获取交易账户状态
    const txAccount = await program.account.transaction.fetch(transaction.publicKey);
    // 验证交易已被执行
    expect(txAccount.executedAt.toNumber()).toBeGreaterThan(0);

    // 获取接收者账户执行后的余额
    const balanceAfter = await provider.connection.getBalance(recipient);
    // 验证余额增加正确
    expect(balanceAfter - balanceBefore).toBe(transferAmount.toNumber());
  });

  // 测试用例：已执行的交易再次执行应失败
  it('Fails to execute an already executed transaction', async () => {
    // 验证已执行的交易再次执行会抛出错误
    await expect(
      program.methods
        .executeTransaction()
        .accounts({
          multisig: multisig.publicKey, // 多签账户
          multisigSigner, // 多签 PDA
          transaction: transaction.publicKey, // 交易账户
        })
        .remainingAccounts([
          { pubkey: multisigSigner, isSigner: false, isWritable: true }, // 多签 PDA
          { pubkey: recipient, isSigner: false, isWritable: true }, // 接收者
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // SystemProgram
        ])
        .rpc() // 发送交易
    ).rejects.toThrow(/AlreadyExecuted/); // 期望抛出 AlreadyExecuted 错误
  });

  // --- 独立失败场景测试 ---

  // 定义子测试套件，测试失败场景
  describe('Isolated Failure Scenarios', () => {

    // 测试用例：使用空所有者列表初始化应失败
    it('Fails to initialize with an empty owners list', async () => {
      // 生成测试用多签账户
      const testMultisig = Keypair.generate();
      // 计算 PDA 和 nonce
      const [, nonce] = PublicKey.findProgramAddressSync([testMultisig.publicKey.toBuffer()], program.programId);
      // 验证空所有者列表初始化会抛出错误
      await expect(
        program.methods
          .initialize([], new BN(1), nonce) // 传入空所有者列表
          .accounts({ multisig: testMultisig.publicKey, payer: provider.wallet.publicKey }) // 指定账户
          .signers([testMultisig]) // 测试多签账户签名
          .rpc() // 发送交易
      ).rejects.toThrow(/InvalidOwners/); // 期望抛出 InvalidOwners 错误
    });

    // 测试用例：使用无效阈值（0）初始化应失败
    it('Fails to initialize with an invalid threshold (e.g., 0)', async () => {
      // 生成测试用多签账户
      const testMultisig = Keypair.generate();
      // 计算 PDA 和 nonce
      const [, nonce] = PublicKey.findProgramAddressSync([testMultisig.publicKey.toBuffer()], program.programId);
      // 验证阈值为 0 初始化会抛出错误
      await expect(
        program.methods
          .initialize(owners, new BN(0), nonce) // 传入阈值 0
          .accounts({ multisig: testMultisig.publicKey, payer: provider.wallet.publicKey }) // 指定账户
          .signers([testMultisig]) // 测试多签账户签名
          .rpc() // 发送交易
      ).rejects.toThrow(/InvalidThreshold/); // 期望抛出 InvalidThreshold 错误
    });

    // 测试用例：非所有者尝试创建交易应失败
    it('Fails when a non-owner tries to create a transaction', async () => {
      // 生成非所有者的 Keypair
      const nonOwner = Keypair.generate();
      // 给非所有者账户空投资金
      await airdrop(provider.connection, nonOwner.publicKey);
      // 生成测试用交易账户
      const testTransaction = Keypair.generate();

      // 验证非所有者创建交易会抛出错误
      await expect(
        program.methods
          .createTransaction(SystemProgram.programId, [], Buffer.from("")) // 传入空账户和数据
          .accounts({
            multisig: multisig.publicKey, // 多签账户
            transaction: testTransaction.publicKey, // 交易账户
            proposer: nonOwner.publicKey, // 非所有者作为提案者
          })
          .signers([nonOwner, testTransaction]) // 非所有者和交易账户签名
          .rpc() // 发送交易
      ).rejects.toThrow(/InvalidOwner/); // 期望抛出 InvalidOwner 错误
    });

    // 测试用例：非所有者尝试批准交易应失败
    it('Fails when a non-owner tries to approve a transaction', async () => {
      // 生成非所有者的 Keypair
      const nonOwner = Keypair.generate();
      // 验证非所有者批准交易会抛出错误
      await expect(
        program.methods
          .approve()
          .accounts({
            multisig: multisig.publicKey, // 多签账户
            transaction: transaction.publicKey, // 交易账户
            owner: nonOwner.publicKey, // 非所有者
          })
          .signers([nonOwner]) // 非所有者签名
          .rpc() // 发送交易
      ).rejects.toThrow(/InvalidOwner/); // 期望抛出 InvalidOwner 错误
    });

    // 测试用例：使用不匹配的账户列表执行交易应失败
    it('Fails to execute with mismatched remaining accounts', async () => {
      // 生成测试用交易账户
      const localTx = Keypair.generate();
      // 定义不完整的账户列表
      const accs = [ { pubkey: recipient, isSigner: false, isWritable: true } ];
      // 创建交易提案
      await program.methods
        .createTransaction(SystemProgram.programId, accs, Buffer.from("")) // 传入不完整账户列表
        .accounts({ multisig: multisig.publicKey, transaction: localTx.publicKey, proposer: ownerA.publicKey }) // 指定账户
        .signers([ownerA, localTx]) // ownerA 和交易账户签名
        .rpc(); // 发送交易
      // ownerB 批准交易
      await program.methods.approve()
        .accounts({ multisig: multisig.publicKey, transaction: localTx.publicKey, owner: ownerB.publicKey }) // 指定账户
        .signers([ownerB]) // ownerB 签名
        .rpc(); // 发送交易
      
      // 验证不匹配的账户列表执行交易会抛出错误
      await expect(
        program.methods
          .executeTransaction()
          .accounts({ multisig: multisig.publicKey, multisigSigner, transaction: localTx.publicKey }) // 指定账户
          .remainingAccounts([]) // 传入空账户列表
          .rpc() // 发送交易
      ).rejects.toThrow(/InvalidAccounts/); // 期望抛出 InvalidAccounts 错误
    });
  });
});