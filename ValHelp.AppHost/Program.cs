
var builder = DistributedApplication.CreateBuilder(args);
// var username = builder.AddParameter("username", secret: true);
// var password = builder.AddParameter("password", secret: true);
var db = builder.AddPostgres("valhelp-db").AddDatabase("valhelp");
var api = builder.AddProject<Projects.ValHelp_ApiService>("valhelp-api");

builder.AddProject<Projects.ValHelp_Web>("valhelp-web")
    .WithExternalHttpEndpoints()
    .WithReference(db)
    .WaitFor(db)
    .WithReference(api)
    .WaitFor(api);

builder.Build().Run();
