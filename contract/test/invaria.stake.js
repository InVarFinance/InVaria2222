const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const RICH_USDC_ACCOUNT = "0x55FE002aefF02F77364de339a1292923A15844B8";
const MULTISIG_ADDRESS = "0xAcB683ba69202c5ae6a3B9b9b191075295b1c41C";

const truffleAssert = require("truffle-assertions");
const InVaria = artifacts.require("InVaria");
const InVariaStaking = artifacts.require("InVariaStaking");
const IERC20 = artifacts.require("IERC20");

const BASE_URL = "ipfs://invaria.test/{id}.json";
const { toWei, fromWei } = web3.utils;
const YEAR_IN_SECONDS = 31536000;
const APR_BY_MIN = 1200000000;

const send = (payload) => {
  if (!payload.jsonrpc) payload.jsonrpc = "2.0";
  if (!payload.id) payload.id = new Date().getTime();

  return new Promise((resolve, reject) => {
    web3.currentProvider.send(payload, (error, result) => {
      if (error) return reject(error);

      return resolve(result);
    });
  });
}

const mineBlock = () => send({ method: "evm_mine" });

const fastForward = async (seconds) => {
  if (web3.utils.isBN(seconds)) seconds = seconds.toNumber();

  if (typeof seconds === "string") seconds = parseFloat(seconds);

  await send({
    method: "evm_increaseTime",
    params: [seconds]
  });

  await mineBlock();
}

const getGasPrice = () => {
  return new Promise((resolve, reject) => {
    web3.eth.getGasPrice((error, result) => {
      if (error) return reject(error);

      return resolve(Number(result));
    });
  });
};

contract("InvariaStake", (accounts) => {
  let nftInstance = null;
  let stakeInstance = null;
  let USDC = null;
  const options = { from: RICH_USDC_ACCOUNT };
  const failedOptions = { from: accounts[1] };
  let gasPrice;
  const logGasFee = (testCase, estimateGas) => {
    console.log(testCase, fromWei(
      (Number(estimateGas)*gasPrice).toString(), "ether"), "ether");
  }

  before(async () => {
    USDC = await IERC20.at(USDC_ADDRESS);
    nftInstance = await InVaria.new(BASE_URL);
    await nftInstance.AddWhite([RICH_USDC_ACCOUNT], true);
    assert.isTrue(await nftInstance.WhiteList(RICH_USDC_ACCOUNT), "failed to add white list");
    await USDC.approve(nftInstance.address, toWei("10"), options);
    await nftInstance.mintNFT(30, options);
    assert.equal(
      await nftInstance.balanceOf(RICH_USDC_ACCOUNT),
      30,
      "white list failed to mint nft"
    );
    gasPrice = await getGasPrice();
  });

  describe("#constructor()", () => {
    it("initiate staking contract", async () => {
      stakeInstance = await InVariaStaking.new(
        nftInstance.address,
        USDC_ADDRESS
      );
      await nftInstance.setStakingAddress(stakeInstance.address);
      await USDC.transfer(
        stakeInstance.address,
        toWei("1", "micro"),
        options
      );
      const tx = await nftInstance.setApprovalForAll(stakeInstance.address, true);
      /**
       * emit ApprovalForAll while setApprovalForAll
       * {account} the owner of ERC1155 contract
       * {operator} the person who is able to manipulate NFT in behalf of the contract owner
       */
      truffleAssert.eventEmitted(tx, "ApprovalForAll", (event) => {
        return event.account === accounts[0] &&
        event.operator === stakeInstance.address &&
        event.approved;
      });

      logGasFee(
        "deploy stake contract cost:",
        await InVariaStaking.new.estimateGas(nftInstance.address, USDC_ADDRESS)
      );
    });

    it("check the basic info of the contract", async () => {
      assert.equal(await stakeInstance.WithDrawAddress(), MULTISIG_ADDRESS);
      assert.equal(await stakeInstance.AprByMin(), APR_BY_MIN);
      assert.equal(await stakeInstance.YearInSeconds(), YEAR_IN_SECONDS);
    });
  });

  describe("#stake()", () => {
    it("stake invaria nft", async () => {
      // stake nft est. gas
      logGasFee(
        "stake 1 nft cost:",
        await stakeInstance.stakeNFT.estimateGas(1, options)
      );
      logGasFee(
        "stake 10 nfts cost:",
        await stakeInstance.stakeNFT.estimateGas(10, options)
      );

      await stakeInstance.stakeNFT(1, options);
      await stakeInstance.stakeNFT(2, options);
      for(let i = 0; i < 8; i++) {
        await stakeInstance.stakeNFT(1, options);
      }

      const stakeRecord = await stakeInstance.stakingInfo(RICH_USDC_ACCOUNT, 0);
      assert.equal(stakeRecord.stakeNFTamount, 1, "failed to stake NFT");
      
      const burnRecord = await stakeInstance.burningInfo(RICH_USDC_ACCOUNT, 0);
      assert.equal(burnRecord.burnableNFTamount, 1, "failed to create a burning record");
    });

    it("should not stake 0 nft", async () => {
      await truffleAssert.reverts(
        stakeInstance.stakeNFT(0, options),
        "Can't stake zero"
      );
    });

    it("should not stake over nft owner balance", async () => {
      await truffleAssert.reverts(
        stakeInstance.stakeNFT(100, options),
        "Invalid input balance"
      );

      await truffleAssert.reverts(
        stakeInstance.stakeNFT(1, failedOptions),
        "Invalid input balance"
      );
    });
  });

  describe("#unstake()", () => {
    it("unstake 1 record", async () => {
      // unstak nft est. gas
      logGasFee(
        "unstake 1 record cost:",
        await stakeInstance.unStake.estimateGas(1, options)
      );
      logGasFee(
        "unstake 10 records cost:",
        await stakeInstance.unStake.estimateGas(10, options)
      );

      await stakeInstance.unStake(1, options);
      const stakeRecord = await stakeInstance.stakingInfo(RICH_USDC_ACCOUNT, 0);
      assert.isTrue(stakeRecord.isUnstake, "failed to unstake NFT");
    });

    it("unstake multiple records", async () => {
      await stakeInstance.unStake(10, options);
      const stakeRecord2 = await stakeInstance.stakingInfo(RICH_USDC_ACCOUNT, 1);
      const stakeRecord3 = await stakeInstance.stakingInfo(RICH_USDC_ACCOUNT, 2);
      assert.isTrue(
        stakeRecord2.isUnstake && stakeRecord3.isUnstake,
        "failed to unstake multiple records"
      );
    });

    it("should not unstake nfts more than balance", async () => {
      truffleAssert.reverts(
        stakeInstance.unStake(1, options),
        "You don't have enough staking NFTs"
      );

      truffleAssert.reverts(
        stakeInstance.unStake(1, failedOptions),
        "You don't have enough staking NFTs"
      );
    });
  });

  describe("#claim()", () => {
    it("claim yield after unstake", async () => {
      // withdraw est. gas
      logGasFee(
        "withdraw unstake yield cost:",
        await stakeInstance.withDraw.estimateGas(options)
      );

      const claimableAmount = await stakeInstance.CheckClaimValue(RICH_USDC_ACCOUNT);
      assert.notEqual(claimableAmount, 0, "failed to calculate claimable yield");
      
      await stakeInstance.withDraw(options);
      const claimAmount = await stakeInstance.CheckClaimValue(RICH_USDC_ACCOUNT);
      assert.equal(claimAmount, 0, "failed to claim");
    });

    it("claim yield while staking", async () => {
      for(let i = 0; i < 10; i++) {
        await stakeInstance.stakeNFT(1, options);
      }
      await fastForward(10);

      // withdraw est. gas
      logGasFee(
        `withdraw staking records yield cost:`,
        await stakeInstance.withDraw.estimateGas(options)
      );

      const claimAmount = await stakeInstance.CheckClaimValue(RICH_USDC_ACCOUNT);
      await stakeInstance.withDraw.estimateGas(options);
      assert.notEqual(claimAmount, 0, "failed to claim");
    });
  });

  describe("#burn()", () => {
    it("should not burn nft during lock time", async () => {
      await truffleAssert.reverts(
        stakeInstance.BurnNFT(1, options),
        "Unlock time is coming soon"
      );
    });

    it("burn nft after lock time", async () => {
      await fastForward(YEAR_IN_SECONDS);
      // burn nft est. gas
      logGasFee(
        "burn 1 nft cost:",
        await stakeInstance.BurnNFT.estimateGas(1, options)
      );
      logGasFee(
        "burn 10 nfts cost:",
        await stakeInstance.BurnNFT.estimateGas(10, options)
      );

      await stakeInstance.BurnNFT(1, options);
      assert.isTrue(await stakeInstance.burningInfo(RICH_USDC_ACCOUNT, 0).then(burnRecord => {
        return burnRecord.isBurn}), "failed to burn");
      assert.equal(await nftInstance.balanceOf(RICH_USDC_ACCOUNT, 2), 1, "failed to mint memorial nft");
      
      await stakeInstance.BurnNFT(10, options);
      assert.isTrue(await stakeInstance.burningInfo(RICH_USDC_ACCOUNT, 1).then(burnRecord => {
        return burnRecord.isBurn}), "failed to burn multiple records");
      assert.equal(await nftInstance.balanceOf(RICH_USDC_ACCOUNT, 2), 11, "failed to mint memorial nfts");
    });
  });
});