const InVaria = artifacts.require("InVaria");
const InVariaStaking = artifacts.require("InVariaStaking");

module.exports = async function(deployer) {
  await deployer.deploy(InVaria, "ipfs://invaria.test");
  const invariaInstance = await InVaria.deployed();
  const usdc = await invariaInstance.USDC();
  await deployer.deploy(InVariaStaking, invariaInstance.address, usdc);
};