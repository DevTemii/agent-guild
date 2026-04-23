// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {FreelanceEscrow} from "./FreelanceEscrow.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
    function expectRevert() external;
    function expectRevert(bytes calldata revertData) external;
    function warp(uint256 newTimestamp) external;
}

contract EscrowActor {
    function createProject(
        FreelanceEscrow escrow,
        address freelancer
    ) external returns (uint256) {
        return escrow.createProject(freelancer);
    }

    function cancelProject(FreelanceEscrow escrow, uint256 projectId) external {
        escrow.cancelProject(projectId);
    }

    function deposit(
        FreelanceEscrow escrow,
        uint256 projectId,
        uint256 amount
    ) external {
        escrow.deposit{value: amount}(projectId);
    }

    function submitWork(FreelanceEscrow escrow, uint256 projectId) external {
        escrow.submitWork(projectId);
    }

    function approveAndRelease(
        FreelanceEscrow escrow,
        uint256 projectId
    ) external {
        escrow.approveAndRelease(projectId);
    }

    function clientRefundExpiredProject(
        FreelanceEscrow escrow,
        uint256 projectId
    ) external {
        escrow.clientRefundExpiredProject(projectId);
    }

    function adminRefundProject(
        FreelanceEscrow escrow,
        uint256 projectId
    ) external {
        escrow.adminRefundProject(projectId);
    }

    receive() external payable {}
}

contract FreelanceEscrowTest {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    FreelanceEscrow internal escrow;
    EscrowActor internal client;
    EscrowActor internal freelancer;
    EscrowActor internal otherUser;

    uint256 internal constant PROJECT_ID = 1;
    uint256 internal constant ONE_CELO = 1 ether;
    uint256 internal constant TWO_CELO = 2 ether;
    uint256 internal constant THREE_CELO = 3 ether;

    function setUp() public {
        escrow = new FreelanceEscrow();
        client = new EscrowActor();
        freelancer = new EscrowActor();
        otherUser = new EscrowActor();

        vm.deal(address(client), 10 ether);
        vm.deal(address(freelancer), 10 ether);
        vm.deal(address(otherUser), 10 ether);
    }

    function test_ClientCanCancelBeforeFunding() public {
        client.createProject(escrow, address(freelancer));
        client.cancelProject(escrow, PROJECT_ID);

        (, , uint256 amount, FreelanceEscrow.Status status) = escrow.getProject(
            PROJECT_ID
        );

        require(amount == 0, "cancel should keep amount at zero");
        require(
            status == FreelanceEscrow.Status.Cancelled,
            "project should be cancelled"
        );
    }

    function test_ClientCanRecoverAfterFundedInactivityTimeout() public {
        client.createProject(escrow, address(freelancer));
        client.deposit(escrow, PROJECT_ID, ONE_CELO);

        vm.warp(block.timestamp + escrow.CLIENT_RECOVERY_DELAY() + 1);

        uint256 clientBalanceBefore = address(client).balance;
        client.clientRefundExpiredProject(escrow, PROJECT_ID);

        (, , uint256 amount, FreelanceEscrow.Status status) = escrow.getProject(
            PROJECT_ID
        );

        require(amount == 0, "refund should clear amount");
        require(
            status == FreelanceEscrow.Status.Refunded,
            "project should be refunded"
        );
        require(address(escrow).balance == 0, "escrow should be empty");
        require(
            address(client).balance == clientBalanceBefore + ONE_CELO,
            "client should recover funds"
        );
    }

    function test_FundedSubmitReleasePathStillWorks() public {
        client.createProject(escrow, address(freelancer));
        client.deposit(escrow, PROJECT_ID, TWO_CELO);

        uint256 freelancerBalanceBefore = address(freelancer).balance;

        freelancer.submitWork(escrow, PROJECT_ID);
        client.approveAndRelease(escrow, PROJECT_ID);

        (, , uint256 amount, FreelanceEscrow.Status status) = escrow.getProject(
            PROJECT_ID
        );

        require(amount == 0, "release should clear amount");
        require(
            status == FreelanceEscrow.Status.Released,
            "project should be released"
        );
        require(address(escrow).balance == 0, "escrow should be empty");
        require(
            address(freelancer).balance == freelancerBalanceBefore + TWO_CELO,
            "freelancer should receive payout"
        );
    }

    function test_BetaAdminCanRefundSubmittedProject() public {
        client.createProject(escrow, address(freelancer));
        client.deposit(escrow, PROJECT_ID, THREE_CELO);
        freelancer.submitWork(escrow, PROJECT_ID);

        uint256 clientBalanceBefore = address(client).balance;

        escrow.adminRefundProject(PROJECT_ID);

        (, , uint256 amount, FreelanceEscrow.Status status) = escrow.getProject(
            PROJECT_ID
        );

        require(amount == 0, "admin refund should clear amount");
        require(
            status == FreelanceEscrow.Status.Refunded,
            "project should be refunded"
        );
        require(address(escrow).balance == 0, "escrow should be empty");
        require(
            address(client).balance == clientBalanceBefore + THREE_CELO,
            "client should receive beta refund"
        );
    }

    function test_InvalidTransitionsAndUnauthorizedCallersRevert() public {
        client.createProject(escrow, address(freelancer));

        vm.expectRevert();
        freelancer.cancelProject(escrow, PROJECT_ID);

        client.deposit(escrow, PROJECT_ID, ONE_CELO);

        vm.expectRevert();
        client.clientRefundExpiredProject(escrow, PROJECT_ID);

        vm.expectRevert();
        client.approveAndRelease(escrow, PROJECT_ID);

        vm.expectRevert();
        otherUser.adminRefundProject(escrow, PROJECT_ID);
    }
}
