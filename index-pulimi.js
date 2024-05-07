const aws = require("@pulumi/aws");
const pulumi = require("@pulumi/pulumi");
const size = "t2.micro"; // for example
const ami = "ami-07caf09b362be10b8"; // update to your preferred AMI

// Create VPC
const vpc = new aws.ec2.Vpc("VPC", {
    cidrBlock: "10.0.0.0/16",
    enableDnsSupport: true,
    enableDnsHostnames: true,
    tags: {
        Name: pulumi.getStack(),
    },
});


// Create a security group for the EC2 instance to allow HTTP traffic
const sg = new aws.ec2.SecurityGroup("web-sg", {
    vpcId: vpc.id,
    ingress: [
        { protocol: "tcp", fromPort: 8080, toPort: 8080, cidrBlocks: ["0.0.0.0/0"] },
        { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] }, // For SSH Access
        { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"]}
    ],
    egress: [
        { protocol: "tcp", fromPort: 0, toPort: 65535, cidrBlocks: ["0.0.0.0/0"] }
    ],
});

// Create a S3 bucket to use for codepipeline
const bucket = new aws.s3.Bucket("CodePipelineS3Bucket",{
    bucket: "codepipeline-bucket-aws-bootstrap",
    acl: "private",
    serverSideEncryptionConfiguration: {
        rule: {
            applyServerSideEncryptionByDefault: {
                sseAlgorithm: "AES256",
            },
        },
    },
    publicAccessBlockConfiguration: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
    },
}, {
    // Prevent the bucket from being deleted on stack destroy
    deleteBeforeReplace: true,
});


// Create Subnet in AZ1
const subnetAZ1 = new aws.ec2.Subnet("SubnetAZ1", {
    vpcId: vpc.id,
    availabilityZone: pulumi.all([aws.getAvailabilityZones()])
        .apply(([azs]) => azs[0]),
    cidrBlock: "10.0.0.0/18",
    mapPublicIpOnLaunch: true,
    tags: {
        Name: pulumi.getStack(),
        AZ: pulumi.all([aws.getAvailabilityZones()])
            .apply(([azs]) => azs[0]),
    },
});

// Create Subnet in AZ2
const subnetAZ2 = new aws.ec2.Subnet("SubnetAZ2", {
    vpcId: vpc.id,
    availabilityZone: pulumi.all([aws.getAvailabilityZones()])
        .apply(([azs]) => azs[1]),
    cidrBlock: "10.0.64.0/18",
    mapPublicIpOnLaunch: true,
    tags: {
        Name: pulumi.getStack(),
        AZ: pulumi.all([aws.getAvailabilityZones()])
            .apply(([azs]) => azs[1]),
    },
});

// Create Internet Gateway
const internetGateway = new aws.ec2.InternetGateway("InternetGateway", {
    tags: {
        Name: pulumi.getStack(),
    },
});

// Attach Internet Gateway to VPC
const internetGatewayAttachment = new aws.networkmanager.VpcAttachment("InternetGatewayAttachment", {
    internetGatewayId: internetGateway.id,
    vpcId: vpc.id, // Assuming 'vpc' is the reference to the VPC created in the previous example
});


// Create Route Table
const routeTable = new aws.ec2.RouteTable("RouteTable", {
    vpcId: vpc.id, // Assuming 'vpc' is the reference to the VPC created earlier
    tags: {
        Name: pulumi.getStack(),
    },
});

// Create Default Public Route
const defaultPublicRoute = new aws.ec2.Route("DefaultPublicRoute", {
    routeTableId: routeTable.id,
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: internetGateway.id, // Assuming 'internetGateway' is the reference to the Internet Gateway created earlier
}, { dependsOn: internetGatewayAttachment }); // Ensure InternetGatewayAttachment completes before creating the route

// Associate Subnet AZ1 with Route Table
const subnetRouteTableAssociationAZ1 = new aws.ec2.SubnetRouteTableAssociation("SubnetRouteTableAssociationAZ1", {
    routeTableId: routeTable.id,
    subnetId: subnetAZ1.id, // Assuming 'subnetAZ1' is the reference to the subnet in AZ1 created earlier
});

// Associate Subnet AZ2 with Route Table
const subnetRouteTableAssociationAZ2 = new aws.ec2.SubnetRouteTableAssociation("SubnetRouteTableAssociationAZ2", {
    routeTableId: routeTable.id,
    subnetId: subnetAZ2.id, // Assuming 'subnetAZ2' is the reference to the subnet in AZ2 created earlier
});

// Create an EC2 instance and install a simple web server
const server = new aws.ec2.Instance("web-server", {
    // Refer to your AMI ID
    ami: ami,
    instanceType: size,
    subnetId: subnetAZ1.id, 
    securityGroups: [sg.name], // reference the security group we created above
    // Setup an SSH keypair for a secure connection, replace with your own
    keyName: "awsedicative",
    userData: pulumi.interpolate` #!/bin/bash -xe

    exec > /tmp/userdata.log 2>&1 

    yum -y update

    cat > /tmp/install_script.sh << EOF 
        echo "Setting up NodeJS Environment"
        curl https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
        . /home/ec2-user/.nvm/nvm.sh
        . /home/ec2-user/.bashrc
        nvm alias default v22
        nvm install v22
        nvm use v22
        wget https://github.com/robertonunezc/aws-bootstrap/archive/master.zip 
        unzip master.zip
        mv aws-bootstrap-master app
        mkdir -p /home/ec2-user/app/logs
        cd app
        npm install
        npm start
    EOF &
` // Starts a simple HTTP server on port 80
});

// Create a second EC2 instance
const server2 = new aws.ec2.Instance("web-server2", {
    ami: ami,
    instanceType: size,
    securityGroups: [sg.name],
    subnetId: subnetAZ2.id, // Assuming 'subnetAZ2' is the reference to the subnet in AZ2 created earlier
    keyName: "awsedicative",
    userData:pulumi.interpolate ` #!/bin/bash -xe

    exec > /tmp/userdata.log 2>&1 

    yum -y update

    cat > /tmp/install_script.sh << EOF 
        echo "Setting up NodeJS Environment"
        curl https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
        . /home/ec2-user/.nvm/nvm.sh
        . /home/ec2-user/.bashrc
        nvm alias default v22
        nvm install v22
        nvm use v22
        wget https://github.com/robertonunezc/aws-bootstrap/archive/master.zip 
        unzip master.zip
        mv aws-bootstrap-master app
        mkdir -p /home/ec2-user/app/logs
        cd app
        npm install
        npm start
    EOF &
   `
}); 


// Create Load Balancer
const loadBalancer = new aws.elasticloadbalancingv2.LoadBalancer("LoadBalancer", {
    type: "application",
    scheme: "internet-facing",
    securityGroups: [sg.id], // Assuming 'securityGroup' is the reference to the security group created earlier
    subnets: [subnetAZ1.id, subnetAZ2.id], // Assuming 'subnetAZ1' and 'subnetAZ2' are the references to the subnets created earlier
    tags: {
        Name: pulumi.getStack(),
    },
});


// Create Load Balancer Listener
const loadBalancerListener = new aws.elasticloadbalancingv2.Listener("LoadBalancerListener", {
    defaultActions: [{
        type: "forward",
        targetGroupArn: loadBalancerTargetGroup.arn, // Assuming 'loadBalancerTargetGroup' is the reference to the target group created earlier
    }],
    loadBalancerArn: loadBalancer.arn, // Assuming 'loadBalancer' is the reference to the load balancer created earlier
    port: 80,
    protocol: "HTTP",
});

// Create Load Balancer Target Group
const loadBalancerTargetGroup = new aws.elasticloadbalancingv2.TargetGroup("LoadBalancerTargetGroup", {
    targetType: "instance",
    port: 8080,
    protocol: "HTTP",
    vpcId: vpc.id, // Assuming 'vpc' is the reference to the VPC created earlier
    healthCheckEnabled: true,
    healthCheckProtocol: "HTTP",
    targets: [
        { id: server.id }, // Assuming 'instance' is the reference to the instance created earlier
        { id: server2.id }, // Assuming 'instance2' is the reference to another instance
    ],
    tags: {
        Name: pulumi.getStack(),
    },
});

// TODO create a template for the EC2 instance creation


exports.publicIp = server.publicIp;
exports.publicHostName = server.publicDns;