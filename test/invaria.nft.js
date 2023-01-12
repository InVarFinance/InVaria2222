const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const RICH_USDC_ACCOUNT = "0x55FE002aefF02F77364de339a1292923A15844B8";
const MULTISIG_WALLET = "0xAcB683ba69202c5ae6a3B9b9b191075295b1c41C";
const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";

const truffleAssert = require("truffle-assertions");
const InVaria = artifacts.require("InVaria");
const IERC20 = artifacts.require("IERC20");

const NAME = "InVaria 2222";
const SYMBOL = "InVaria";
const TOTAL_SUPPLY = 2000;
const SUPPLY = 100;
const BASE_URL = "ipfs://invaria.test/{id}.json";
const SELLING_PRICE = 10000000000;
const { toBN, toWei, fromWei } = web3.utils;
const getGasPrice = () => {
  return new Promise((resolve, reject) => {
    web3.eth.getGasPrice((error, result) => {
      if (error) return reject(error);

      return resolve(Number(result));
    });
  });
};


contract("InVaria", (accounts) => {
  let invariaInstance;
  let USDC;
  let options = { from: RICH_USDC_ACCOUNT };
  let failOptions = { from: accounts[1] };
  let gasPrice;
  const logGasFee = (testCase, estimateGas) => {
    console.log(testCase, fromWei(
      (Number(estimateGas)*gasPrice).toString(), "ether"), "ether");
  }

  before(async () => {
    invariaInstance = await InVaria.new(BASE_URL);
    const tx = await truffleAssert.createTransactionResult(
      invariaInstance,
      invariaInstance.transactionHash
    );
    truffleAssert.eventEmitted(tx, "SetBaseURI", (event) => {
      return event._baseURI === web3.utils.soliditySha3(BASE_URL);
    });
    USDC = await IERC20.at(USDC_ADDRESS);
    gasPrice = await getGasPrice();
    logGasFee(
      "deploy nft contract cost:",
      await InVaria.new.estimateGas(BASE_URL)
    );
  });

  describe("#constructor()", () => {
    it("check the basic info of the token", async () => {
      assert.equal(await invariaInstance.name(), NAME);
      assert.equal(await invariaInstance.symbol(), SYMBOL);
      assert.equal(await invariaInstance.totalSupply(), TOTAL_SUPPLY);
      assert.equal(await invariaInstance.SaleSupply(), SUPPLY);
      assert.equal(await invariaInstance.WithDrawAddress(), MULTISIG_WALLET);
      assert.equal(await invariaInstance.SellingPrice(), SELLING_PRICE);
      assert.isFalse(await invariaInstance.PublicSale());
    });
  });

  describe("#whitelist()", () => {
    it("should not in the whitelist", async () => {
      const isWhiteList = await invariaInstance.WhiteList(RICH_USDC_ACCOUNT);
      assert.isFalse(isWhiteList, "shouldn't in whitelist");
    });

    it("add white list on InVaria contract", async () => {
      await invariaInstance.AddWhite([RICH_USDC_ACCOUNT], true);
      const isWhiteList = await invariaInstance.WhiteList(RICH_USDC_ACCOUNT);
      assert.isTrue(isWhiteList, "failed to add white list");
      
      // add white list est. gas
      logGasFee(
        "add white list cost:", 
        await invariaInstance.WhiteList.estimateGas(RICH_USDC_ACCOUNT)
      );
    });
  });

  describe("#mint()", () => {
    it("should not mint nft without whitelisted", async () => {
      await USDC.approve(
        invariaInstance.address,
        toWei("1000"),
        failOptions
      );
      // mint revert
      await truffleAssert.fails(
        invariaInstance.mintNFT(1, failOptions),
        truffleAssert.ErrorType.REVERT,
        "You are not on the white list"
      );
    });

    it("white list mint invaria nft", async () => {
      await USDC.approve(
        invariaInstance.address,
        toWei("1000"),
        options
      );
      const mintOneTx = await invariaInstance.mintNFT(1, options);
      // emit TransferSingle event while minting NFT
      truffleAssert.eventEmitted(mintOneTx, "TransferSingle", (event) => {
        return (
          event.operator === RICH_USDC_ACCOUNT &&
          event.from === EMPTY_ADDRESS &&
          event.to === RICH_USDC_ACCOUNT &&
          event.id.toNumber() === 1 &&
          event.value.toNumber() === 1
        );
      });
      assert.equal(
        await invariaInstance.balanceOf(RICH_USDC_ACCOUNT),
        1,
        "white list failed to mint nft"
      );

      const mintNineTx = await invariaInstance.mintNFT(9, options);
      // emit TransferSingle event while minting NFT
      truffleAssert.eventEmitted(mintNineTx, "TransferSingle", {
        operator: RICH_USDC_ACCOUNT,
        from: EMPTY_ADDRESS,
        to: RICH_USDC_ACCOUNT,
        id: toBN(1),
        value: toBN(9),
      });
      assert.equal(
        await invariaInstance.balanceOf(RICH_USDC_ACCOUNT),
        10,
        "white list failed to mint more nft"
      );

      // whitelisted mint est. gas
      logGasFee(
        "whitelisted mint 1 nft cost:",
        await invariaInstance.mintNFT.estimateGas(1, options)
      );
      logGasFee(
        "whitelisted mint 10 nfts cost:",
        await invariaInstance.mintNFT.estimateGas(10, options)
      );
    });

    it("should be add into presale buyer once minting nft", async () => {
      assert.isTrue(
        await invariaInstance.CheckPreSaleBuyer(RICH_USDC_ACCOUNT),
        "failed to add whitelist buyer into presale buyer"
      );
    });

    it("should not mint invaria nft before the public sale button is on", async () => {
      truffleAssert.reverts(
        invariaInstance.PublicMintNFT(1, options),
        "Punbic sale not start yet"
      );
    });

    it("public sale mint invaria nft", async () => {
      await invariaInstance.publicSaleStart(true);
      assert.equal(
        await invariaInstance.PublicSale(),
        true,
        "failed to set public sale"
      );

      const mintOneTx = await invariaInstance.PublicMintNFT(1, options);
      // emit TransferSingle event while minting NFT
      truffleAssert.eventEmitted(mintOneTx, "TransferSingle", {
        operator: RICH_USDC_ACCOUNT,
        from: EMPTY_ADDRESS,
        to: RICH_USDC_ACCOUNT,
        id: toBN(1),
        value: toBN(1),
      });
      assert.equal(
        await invariaInstance.balanceOf(RICH_USDC_ACCOUNT),
        11,
        "public sale failed to mint nft"
      );

      const mintNineTx = await invariaInstance.PublicMintNFT(9, options);
      // emit TransferSingle event while minting NFT
      truffleAssert.eventEmitted(mintNineTx, "TransferSingle", (event) => {
        return (
          event.operator === RICH_USDC_ACCOUNT &&
          event.from === EMPTY_ADDRESS &&
          event.to === RICH_USDC_ACCOUNT &&
          event.id.toNumber() === 1 &&
          event.value.toNumber() === 9
        );
      });
      assert.equal(
        await invariaInstance.balanceOf(RICH_USDC_ACCOUNT),
        20,
        "public sale failed to batch mint nft"
      );

      //public mint est. gas
      logGasFee(
        "public sale mint 1 nft cost:",
        await invariaInstance.PublicMintNFT.estimateGas(1, options)
      );
      logGasFee(
        "public sale mint 10 nfts cost:",
        await invariaInstance.PublicMintNFT.estimateGas(10, options)
      );
    });

    it("should not mint 0 nft", async () => {
      truffleAssert.reverts(
        invariaInstance.mintNFT(0, options),
        "Input amount can't be 0 "
      );

      truffleAssert.reverts(
        invariaInstance.PublicMintNFT(0, options),
        "Punbic sale not start yet"
      );
    });

    it("should not mint over supply amount", async () => {
      truffleAssert.reverts(
        invariaInstance.mintNFT(90, options),
        "Not enought NFT"
      );

      truffleAssert.reverts(
        invariaInstance.mintNFT(1990, options),
        "Not enought NFT"
      );

      truffleAssert.reverts(
        invariaInstance.PublicMintNFT(90, options),
        "Not enought NFT"
      );

      truffleAssert.reverts(
        invariaInstance.PublicMintNFT(1990, options),
        "Not enought NFT"
      );
    });
  });

  describe("#uri()", () => {
    it("fetch base uri", async () => {
      assert.equal(
        await invariaInstance.uri(1),
        `${BASE_URL}1`,
        "failed to setup base uri"
      );

      truffleAssert.reverts(
        invariaInstance.uri(3),
        "URI requested for invalid"
      );
    });
  });
});
