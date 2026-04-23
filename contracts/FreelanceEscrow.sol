// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract FreelanceEscrow {
    event ProjectCancelled(uint256 indexed projectId, address indexed client);
    event ProjectCreated(
        uint256 indexed projectId,
        address indexed client,
        address indexed freelancer
    );
    event ProjectFunded(
        uint256 indexed projectId,
        address indexed client,
        uint256 amount
    );
    event ProjectRefunded(
        uint256 indexed projectId,
        address indexed actor,
        address indexed recipient,
        uint256 amount,
        bytes32 reason
    );
    event ProjectReleased(
        uint256 indexed projectId,
        address indexed client,
        address indexed freelancer,
        uint256 amount
    );
    event WorkSubmitted(uint256 indexed projectId, address indexed freelancer);

    enum Status {
        Created,
        Funded,
        Submitted,
        Released,
        Cancelled,
        Refunded
    }

    struct Project {
        address client;
        address freelancer;
        uint256 amount;
        Status status;
        uint64 createdAt;
        uint64 fundedAt;
        uint64 submittedAt;
    }

    address public immutable betaAdmin;
    uint256 public constant CLIENT_RECOVERY_DELAY = 3 days;
    bytes32 private constant REFUND_REASON_CLIENT_TIMEOUT = "CLIENT_TIMEOUT";
    bytes32 private constant REFUND_REASON_ADMIN_BETA = "ADMIN_BETA";

    uint256 public projectCount;
    mapping(uint256 => Project) public projects;

    constructor() {
        betaAdmin = msg.sender;
    }

    function createProject(address _freelancer) external returns (uint256) {
        require(_freelancer != address(0), "Invalid freelancer");
        require(_freelancer != msg.sender, "Client cannot be freelancer");

        projectCount++;

        projects[projectCount] = Project({
            client: msg.sender,
            freelancer: _freelancer,
            amount: 0,
            status: Status.Created,
            createdAt: uint64(block.timestamp),
            fundedAt: 0,
            submittedAt: 0
        });

        emit ProjectCreated(projectCount, msg.sender, _freelancer);

        return projectCount;
    }

    function cancelProject(uint256 _projectId) external {
        Project storage project = projects[_projectId];

        require(project.client != address(0), "Project does not exist");
        require(msg.sender == project.client, "Only client can cancel");
        require(project.status == Status.Created, "Project cannot be cancelled");

        project.status = Status.Cancelled;

        emit ProjectCancelled(_projectId, msg.sender);
    }

    function deposit(uint256 _projectId) external payable {
        Project storage project = projects[_projectId];

        require(project.client != address(0), "Project does not exist");
        require(msg.sender == project.client, "Only client can deposit");
        require(project.status == Status.Created, "Project not in created state");
        require(msg.value > 0, "Deposit must be greater than zero");

        project.amount = msg.value;
        project.status = Status.Funded;
        project.fundedAt = uint64(block.timestamp);
        project.submittedAt = 0;

        emit ProjectFunded(_projectId, msg.sender, msg.value);
    }

    function submitWork(uint256 _projectId) external {
        Project storage project = projects[_projectId];

        require(project.client != address(0), "Project does not exist");
        require(msg.sender == project.freelancer, "Only freelancer can submit");
        require(project.status == Status.Funded, "Project not funded");

        project.status = Status.Submitted;
        project.submittedAt = uint64(block.timestamp);

        emit WorkSubmitted(_projectId, msg.sender);
    }

    function approveAndRelease(uint256 _projectId) external {
        Project storage project = projects[_projectId];

        require(project.client != address(0), "Project does not exist");
        require(msg.sender == project.client, "Only client can approve");
        require(project.status == Status.Submitted, "Work not submitted");
        require(project.amount > 0, "No funds deposited");

        uint256 amount = project.amount;
        project.amount = 0;
        project.status = Status.Released;

        (bool sent, ) = payable(project.freelancer).call{value: amount}("");
        require(sent, "Transfer failed");

        emit ProjectReleased(
            _projectId,
            msg.sender,
            project.freelancer,
            amount
        );
    }

    function clientRefundExpiredProject(uint256 _projectId) external {
        Project storage project = projects[_projectId];

        require(project.client != address(0), "Project does not exist");
        require(msg.sender == project.client, "Only client can refund");
        require(project.status == Status.Funded, "Project not refundable");
        require(project.amount > 0, "No funds deposited");
        require(
            block.timestamp >= project.fundedAt + CLIENT_RECOVERY_DELAY,
            "Recovery delay not reached"
        );

        _refundProject(
            _projectId,
            msg.sender,
            msg.sender,
            REFUND_REASON_CLIENT_TIMEOUT
        );
    }

    function adminRefundProject(uint256 _projectId) external {
        Project storage project = projects[_projectId];

        require(msg.sender == betaAdmin, "Only beta admin can refund");
        require(project.client != address(0), "Project does not exist");
        require(
            project.status == Status.Funded || project.status == Status.Submitted,
            "Project not refundable"
        );
        require(project.amount > 0, "No funds deposited");

        _refundProject(
            _projectId,
            msg.sender,
            project.client,
            REFUND_REASON_ADMIN_BETA
        );
    }

    function getProject(uint256 _projectId)
        external
        view
        returns (
            address client,
            address freelancer,
            uint256 amount,
            Status status
        )
        {
        Project memory project = projects[_projectId];
        return (
            project.client,
            project.freelancer,
            project.amount,
            project.status
        );
    }

    function _refundProject(
        uint256 _projectId,
        address _actor,
        address _recipient,
        bytes32 _reason
    ) internal {
        Project storage project = projects[_projectId];
        uint256 amount = project.amount;

        project.amount = 0;
        project.status = Status.Refunded;

        (bool sent, ) = payable(_recipient).call{value: amount}("");
        require(sent, "Refund transfer failed");

        emit ProjectRefunded(_projectId, _actor, _recipient, amount, _reason);
    }
}
